const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.json({ limit: '64kb' }));

const PORT = Number(process.env.PORT || 3000);
const DELTA_BASE_URL = process.env.DELTA_BASE_URL || 'https://cdn-ind.testnet.deltaex.org';
const DELTA_API_KEY = process.env.DELTA_API_KEY || '';
const DELTA_API_SECRET = process.env.DELTA_API_SECRET || '';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || '';
const DELTA_TRADING_ENABLED = String(process.env.DELTA_TRADING_ENABLED || 'false').toLowerCase() === 'true';
const DEFAULT_SIZE = Math.max(1, Number.parseInt(process.env.DELTA_DEFAULT_SIZE || '1', 10));
const DEFAULT_SYMBOL = process.env.DELTA_DEFAULT_SYMBOL || 'BTCUSD';

function nowSeconds() {
  return Math.floor(Date.now() / 1000).toString();
}

function sign(method, timestamp, path, queryString = '', body = '') {
  const prehash = `${method}${timestamp}${path}${queryString}${body}`;
  return crypto.createHmac('sha256', DELTA_API_SECRET).update(prehash).digest('hex');
}

async function deltaRequest(method, path, { query = '', payload = null, auth = true } = {}) {
  const queryString = query ? (query.startsWith('?') ? query : `?${query}`) : '';
  const body = payload == null ? '' : JSON.stringify(payload);
  const headers = {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'User-Agent': 'aakruti-delta-bridge-node'
  };

  if (auth) {
    if (!DELTA_API_KEY || !DELTA_API_SECRET) {
      throw new Error('DELTA_API_KEY / DELTA_API_SECRET are not configured');
    }
    const timestamp = nowSeconds();
    headers['api-key'] = DELTA_API_KEY;
    headers['timestamp'] = timestamp;
    headers['signature'] = sign(method, timestamp, path, queryString, body);
  }

  const response = await fetch(`${DELTA_BASE_URL}${path}${queryString}`, {
    method,
    headers,
    body: body || undefined
  });

  const text = await response.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }

  if (!response.ok || data?.success === false) {
    const err = new Error(`Delta API ${response.status}: ${JSON.stringify(data)}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

function normalizeAction(value) {
  const action = String(value || '').trim().toLowerCase();
  if (action === 'buy' || action === 'long') return 'buy';
  if (action === 'sell' || action === 'short') return 'sell';
  if (action === 'close_buy' || action === 'exit_long') return 'sell';
  if (action === 'close_sell' || action === 'exit_short') return 'buy';
  throw new Error(`Unsupported action: ${value}`);
}

function isExitAction(value) {
  const action = String(value || '').trim().toLowerCase();
  return ['close_buy', 'exit_long', 'close_sell', 'exit_short'].includes(action);
}

function verifyWebhook(req) {
  if (!WEBHOOK_SECRET) return true;
  const supplied = String(req.headers['x-webhook-secret'] || req.body?.secret || '');
  const expected = Buffer.from(WEBHOOK_SECRET);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

async function placeMarketOrder({ action, symbol, size, clientOrderId, reduceOnly }) {
  const payload = {
    product_symbol: symbol,
    size,
    side: action,
    order_type: 'market_order',
    reduce_only: Boolean(reduceOnly)
  };
  if (clientOrderId) payload.client_order_id = String(clientOrderId).slice(0, 32);
  return deltaRequest('POST', '/v2/orders', { payload, auth: true });
}

app.get('/', (req, res) => {
  res.json({
    service: 'Aakruti Delta Exchange Bridge',
    environment: DELTA_BASE_URL.includes('testnet') ? 'testnet' : 'production',
    trading_enabled: DELTA_TRADING_ENABLED,
    default_symbol: DEFAULT_SYMBOL
  });
});

app.get('/health/delta/:symbol?', async (req, res) => {
  try {
    const symbol = String(req.params.symbol || DEFAULT_SYMBOL).toUpperCase();
    const result = await deltaRequest('GET', `/v2/products/${encodeURIComponent(symbol)}`, { auth: false });
    res.json({ ok: true, base_url: DELTA_BASE_URL, product: result.result || result });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message, details: err.data || null });
  }
});

app.get('/account/positions', async (req, res) => {
  try {
    const result = await deltaRequest('GET', '/v2/positions/margined', { auth: true });
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ success: false, error: err.message, details: err.data || null });
  }
});

app.post('/webhook', async (req, res) => {
  try {
    if (!verifyWebhook(req)) return res.status(401).json({ success: false, error: 'invalid webhook secret' });

    const rawAction = req.body?.action;
    const action = normalizeAction(rawAction);
    const symbol = String(req.body?.symbol || DEFAULT_SYMBOL).toUpperCase();
    const size = Number.parseInt(req.body?.size ?? DEFAULT_SIZE, 10);
    if (!Number.isInteger(size) || size <= 0) throw new Error('size must be a positive integer contract quantity');

    const reduceOnly = req.body?.reduce_only === true || isExitAction(rawAction);
    const clientOrderId = req.body?.client_order_id || `ak1_${Date.now()}`;

    const normalized = { action, symbol, size, reduce_only: reduceOnly, client_order_id: String(clientOrderId).slice(0, 32) };

    if (!DELTA_TRADING_ENABLED) {
      return res.json({ success: true, dry_run: true, message: 'Signal accepted; trading disabled', order: normalized });
    }

    const result = await placeMarketOrder({ action, symbol, size, clientOrderId, reduceOnly });
    res.json({ success: true, dry_run: false, order: result.result || result });
  } catch (err) {
    console.error(err);
    res.status(err.status || 400).json({ success: false, error: err.message, details: err.data || null });
  }
});

app.listen(PORT, () => {
  console.log(`Aakruti Delta bridge listening on port ${PORT}`);
  console.log(`Delta base URL: ${DELTA_BASE_URL}`);
  console.log(`Trading enabled: ${DELTA_TRADING_ENABLED}`);
});

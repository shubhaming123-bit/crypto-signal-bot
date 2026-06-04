const express = require('express');
const app = express();
app.use(express.json());

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const BINANCE_API_KEY = process.env.BINANCE_API_KEY;
const BINANCE_SECRET = process.env.BINANCE_SECRET;
const TRADE_AMOUNT_USDT = process.env.TRADE_AMOUNT || "20";

const crypto = require('crypto');

async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: message, parse_mode: 'HTML' })
  });
}

async function placeBinanceOrder(side, symbol) {
  const timestamp = Date.now();
  const params = `symbol=${symbol}&side=${side}&type=MARKET&quoteOrderQty=${TRADE_AMOUNT_USDT}&timestamp=${timestamp}`;
  const signature = crypto.createHmac('sha256', BINANCE_SECRET).update(params).digest('hex');
  const url = `https://api.binance.com/api/v3/order?${params}&signature=${signature}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'X-MBX-APIKEY': BINANCE_API_KEY }
  });
  return await res.json();
}

app.post('/webhook', async (req, res) => {
  try {
    const { action, symbol, price } = req.body;
    console.log(`Signal: ${action} ${symbol} @ ${price}`);
    await sendTelegram(`🚨 <b>${action} Signal!</b>\n💰 ${symbol}\n📈 Price: $${price}`);
    const order = await placeBinanceOrder(action, symbol);
    if (order.orderId) {
      await sendTelegram(`✅ <b>Order Placed!</b>\n${action} ${symbol}\nOrder ID: ${order.orderId}`);
    } else {
      await sendTelegram(`⚠️ Order failed: ${JSON.stringify(order)}`);
    }
    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

app.get('/', (req, res) => res.send('Bot is running!'));
app.listen(3000, () => console.log('Bot server running'));

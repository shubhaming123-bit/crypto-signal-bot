# Aakruti / AK1 -> Delta Exchange India bridge

This branch adds a separate Delta execution path without changing the existing Binance bot.

## Architecture

AK1 / MT5 strategy logic -> `AK1_DeltaBridge.mqh` -> HTTP webhook -> `delta_bridge.js` -> Delta Exchange India REST API.

This is deliberately an execution adapter. AK1 entry/exit logic stays inside the EA. The adapter should only be called when AK1 has already decided to open or close a trade.

## Safety defaults

- Uses Delta India demo/testnet by default: `https://cdn-ind.testnet.deltaex.org`
- `DELTA_TRADING_ENABLED=false` by default, so signals are accepted but no order is sent.
- API credentials are environment variables and must never be committed.
- Exit actions automatically use `reduce_only=true`.
- Incoming webhook can be protected with `WEBHOOK_SECRET`.
- `client_order_id` is clipped to Delta's 32-character limit.

## Server setup

1. Copy `.env.delta.example` into your hosting provider's environment-variable configuration.
2. Create a Delta Exchange demo API key and secret.
3. Set `DELTA_API_KEY` and `DELTA_API_SECRET`.
4. Keep `DELTA_TRADING_ENABLED=false` initially.
5. Run `node delta_bridge.js`.
6. Open `/health/delta/BTCUSD` to confirm public Delta connectivity.
7. POST a test signal to `/webhook`; verify the response says `dry_run: true`.
8. Only after the dry-run mapping is correct, set `DELTA_TRADING_ENABLED=true` while still on testnet.

Example webhook body:

```json
{
  "action": "buy",
  "symbol": "BTCUSD",
  "size": 1,
  "client_order_id": "ak1_test_001"
}
```

Exit example:

```json
{
  "action": "close_buy",
  "symbol": "BTCUSD",
  "size": 1,
  "client_order_id": "ak1_test_001_exit"
}
```

## MT5 setup

1. Put `AK1_DeltaBridge.mqh` in the MT5 `MQL5/Include` folder or next to the EA and include it.
2. Add the bridge URL under MT5: Tools -> Options -> Expert Advisors -> Allow WebRequest for listed URL.
3. Keep `DeltaMirrorEnabled=false` during normal XM testing.
4. Call `DeltaSendSignal(...)` immediately after AK1 confirms an entry or exit.
5. Turn `DeltaMirrorEnabled=true` only for Delta demo tests.

## Production Delta India

After demo validation, change:

`DELTA_BASE_URL=https://api.india.delta.exchange`

Create a separate production API key with Trading permission and whitelist the static public IP of the machine/VPS running the bridge. Delta's authenticated signatures are valid only for a short time window, so the host clock must stay synchronized.

Do not reuse testnet keys on production or production keys on testnet.

## Important sizing difference

`size` is Delta contract quantity. It is not the MT5 lot size and not USD/USDT notional. The production adapter must translate AK1 risk/lot sizing into Delta contract quantity using the selected Delta product's contract specifications before live deployment.

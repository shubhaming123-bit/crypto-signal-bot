#pragma once

input string DeltaBridgeURL = "http://127.0.0.1:3000/webhook";
input string DeltaWebhookSecret = "";
input string DeltaSymbol = "BTCUSD";
input int    DeltaContractSize = 1;
input bool   DeltaMirrorEnabled = false;

string DeltaJsonEscape(string s)
{
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   return s;
}

bool DeltaSendSignal(const string action,
                     const string symbol = "",
                     const int size = 0,
                     const bool reduce_only = false,
                     const string client_order_id = "")
{
   if(!DeltaMirrorEnabled)
      return true;

   string out_symbol = (symbol == "" ? DeltaSymbol : symbol);
   int out_size = (size <= 0 ? DeltaContractSize : size);

   string json = "{";
   json += "\"action\":\"" + DeltaJsonEscape(action) + "\",";
   json += "\"symbol\":\"" + DeltaJsonEscape(out_symbol) + "\",";
   json += "\"size\":" + IntegerToString(out_size) + ",";
   json += "\"reduce_only\":" + (reduce_only ? "true" : "false");
   if(client_order_id != "")
      json += ",\"client_order_id\":\"" + DeltaJsonEscape(client_order_id) + "\"";
   json += "}";

   char post[];
   char response[];
   string response_headers;
   StringToCharArray(json, post, 0, WHOLE_ARRAY, CP_UTF8);
   if(ArraySize(post) > 0 && post[ArraySize(post)-1] == 0)
      ArrayResize(post, ArraySize(post)-1);

   string headers = "Content-Type: application/json\r\n";
   if(DeltaWebhookSecret != "")
      headers += "X-Webhook-Secret: " + DeltaWebhookSecret + "\r\n";

   ResetLastError();
   int status = WebRequest("POST", DeltaBridgeURL, headers, 5000, post, response, response_headers);
   if(status < 0)
   {
      Print("Delta bridge WebRequest failed. Error=", GetLastError(),
            ". Add the bridge URL under MT5 > Tools > Options > Expert Advisors > Allow WebRequest for listed URL.");
      return false;
   }

   string body = CharArrayToString(response, 0, -1, CP_UTF8);
   if(status < 200 || status >= 300)
   {
      Print("Delta bridge rejected signal. HTTP=", status, " body=", body);
      return false;
   }

   Print("Delta bridge accepted signal: ", body);
   return true;
}

// Suggested mappings from AK1 trade lifecycle events:
// Entry BUY:        DeltaSendSignal("buy",  DeltaSymbol, DeltaContractSize, false, campaign_id);
// Entry SELL:       DeltaSendSignal("sell", DeltaSymbol, DeltaContractSize, false, campaign_id);
// Close BUY/long:   DeltaSendSignal("close_buy",  DeltaSymbol, DeltaContractSize, true, campaign_id);
// Close SELL/short: DeltaSendSignal("close_sell", DeltaSymbol, DeltaContractSize, true, campaign_id);

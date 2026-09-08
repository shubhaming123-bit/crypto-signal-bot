#pragma once

input string DeltaBridgeURL = "http://127.0.0.1:3000/webhook";
input string DeltaWebhookSecret = "AK1-DEMO-LOCAL-2026";
input string DeltaSymbol = "XAUTUSD";
input bool   DeltaMirrorEnabled = false;

// Delta XAUTUSD UI: 1 lot = 0.001 XAUT.
// XAUT represents one troy ounce of gold, so equivalent exposure is:
// XM lots * XM contract size (oz/lot) / 0.001.
input double DeltaXautPerContract = 0.001;
input double DeltaExposureScale = 1.0; // 1.0 = notional-equivalent; use lower value for reduced demo risk.
input int    DeltaMinimumContracts = 1;
input int    DeltaMaximumContracts = 1000000;

string DeltaJsonEscape(string s)
{
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   return s;
}

int DeltaSizeFromXmLots(const double xm_lots)
{
   double contract_size=SymbolInfoDouble(_Symbol,SYMBOL_TRADE_CONTRACT_SIZE);
   if(contract_size<=0.0)
      contract_size=100.0; // fallback only; normal XM XAUUSD contract size is read from MT5.

   double xaut_amount=xm_lots*contract_size*MathMax(0.0,DeltaExposureScale);
   double per_contract=MathMax(0.00000001,DeltaXautPerContract);
   long raw=(long)MathRound(xaut_amount/per_contract);

   long minc=MathMax(1,DeltaMinimumContracts);
   long maxc=MathMax(minc,DeltaMaximumContracts);
   raw=MathMax(minc,MathMin(maxc,raw));
   return (int)raw;
}

string DeltaClientOrderId(const string tag,const ulong ticket)
{
   string id="ak1_"+tag+"_"+IntegerToString((long)ticket)+"_"+IntegerToString((long)TimeCurrent());
   if(StringLen(id)>32)
      id=StringSubstr(id,0,32);
   return id;
}

bool DeltaSendSignal(const string action,
                     const string symbol = "",
                     const int size = 0,
                     const bool reduce_only = false,
                     const string client_order_id = "")
{
   if(!DeltaMirrorEnabled)
      return true;

   string out_symbol=(symbol=="" ? DeltaSymbol : symbol);
   int out_size=MathMax(1,size);

   string json="{";
   json += "\"action\":\""+DeltaJsonEscape(action)+"\",";
   json += "\"symbol\":\""+DeltaJsonEscape(out_symbol)+"\",";
   json += "\"size\":"+IntegerToString(out_size)+",";
   json += "\"reduce_only\":"+(reduce_only ? "true" : "false");
   if(client_order_id!="")
      json += ",\"client_order_id\":\""+DeltaJsonEscape(client_order_id)+"\"";
   json += "}";

   char post[];
   char response[];
   string response_headers;
   StringToCharArray(json,post,0,WHOLE_ARRAY,CP_UTF8);
   if(ArraySize(post)>0 && post[ArraySize(post)-1]==0)
      ArrayResize(post,ArraySize(post)-1);

   string headers="Content-Type: application/json\r\n";
   if(DeltaWebhookSecret!="")
      headers += "X-Webhook-Secret: "+DeltaWebhookSecret+"\r\n";

   ResetLastError();
   int status=WebRequest("POST",DeltaBridgeURL,headers,5000,post,response,response_headers);
   if(status<0)
   {
      Print("Delta bridge WebRequest failed. Error=",GetLastError(),
            ". Add http://127.0.0.1:3000 under MT5 > Tools > Options > Expert Advisors > Allow WebRequest for listed URL.");
      return false;
   }

   string body=CharArrayToString(response,0,-1,CP_UTF8);
   if(status<200 || status>=300)
   {
      Print("Delta bridge rejected signal. HTTP=",status," body=",body);
      return false;
   }

   Print("Delta bridge accepted signal: ",body);
   return true;
}

#pragma once
#include "WiFiClientSecure.h"
struct HTTPClient { bool begin(const String&){return true;} bool begin(WiFiClient&, const String&){return true;}
  void addHeader(const char*, const char*){} void setTimeout(int){} int GET(){return 200;} int POST(const String&){return 200;} int POST(const char*){return 200;}
  String getString(){return String();} void end(){} };

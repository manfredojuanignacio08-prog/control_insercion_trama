#pragma once
#include "Arduino.h"
#define WL_CONNECTED 3
#define WIFI_STA 1
struct IPA { String toString() const {return "1.1.1.1";} };
struct WiFiT { int status(){return 3;} void mode(int){} void setSleep(bool){} void disconnect(bool){} void begin(const char*,const char*){} IPA localIP(){return IPA();} } static WiFi;
struct WiFiClient {};

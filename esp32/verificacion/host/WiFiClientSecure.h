#pragma once
#include "WiFi.h"
struct WiFiClientSecure : WiFiClient { void stop(){} void setInsecure(){} void setCACert(const char*){} };

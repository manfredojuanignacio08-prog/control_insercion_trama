#pragma once
#include <string>
#include <cstdio>
#include <cstdarg>
#include <cstring>
#include <cstdint>
#include <cmath>
#include <algorithm>
using std::min; using std::max;
#define IRAM_ATTR
#define HIGH 1
#define LOW 0
#define OUTPUT 1
#define INPUT 0
#define FALLING 2
struct String {
  std::string s;
  String() {} String(const char* c):s(c){} String(int v):s(std::to_string(v)){} String(long v):s(std::to_string(v)){}
  String(unsigned long v):s(std::to_string(v)){} String(unsigned v):s(std::to_string(v)){}
  bool startsWith(const char* p) const { return s.rfind(p,0)==0; }
  const char* c_str() const { return s.c_str(); }
  String operator+(const String& o) const { String r; r.s=s+o.s; return r; }
  String& operator+=(const String& o){ s+=o.s; return *this; }
  bool operator==(const char* o) const { return s==o; }
  String toString() const {return *this;}
};
inline String operator+(const char* a, const String& b){ String r(a); return r+b; }
static unsigned long g_ms=0;
inline unsigned long millis(){ return g_ms; }
inline void delay(unsigned long){} inline void delayMicroseconds(unsigned long){}
inline void digitalWrite(int,int){} inline int digitalRead(int){return 0;} inline void pinMode(int,int){}
inline int digitalPinToInterrupt(int p){return p;}
inline void attachInterrupt(int, void(*)(), int){}
inline void noInterrupts(){} inline void interrupts(){}
struct SerialT { void begin(int){} void println(const char*){} void println(const String&){} void print(const char*){}
  void printf(const char*, ...){} } static Serial;
typedef struct { int x; } portMUX_TYPE;
#define portMUX_INITIALIZER_UNLOCKED {0}
inline void portENTER_CRITICAL(portMUX_TYPE*){} inline void portEXIT_CRITICAL(portMUX_TYPE*){}
inline void portENTER_CRITICAL_ISR(portMUX_TYPE*){} inline void portEXIT_CRITICAL_ISR(portMUX_TYPE*){}
inline void vTaskDelay(int){} inline int pdMS_TO_TICKS(int x){return x;}
inline void xTaskCreatePinnedToCore(void(*)(void*), const char*, int, void*, int, void*, int){}
typedef int esp_err_t;
#define ESP_ERR_INVALID_STATE 259

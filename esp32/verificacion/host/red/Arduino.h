// Arduino mínimo para la prueba de red (red/test_red_json.cpp): el de ../Arduino.h más lo que la
// ArduinoJson real le pide al String (concat, asignar un const char*) y digitalRead con el valor del pin.
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
#define INPUT_PULLUP 5
#define FALLING 2
struct String {
  std::string s;
  String() {} String(const char* c):s(c){} String(int v):s(std::to_string(v)){} String(long v):s(std::to_string(v)){}
  String(unsigned long v):s(std::to_string(v)){} String(unsigned v):s(std::to_string(v)){}
  bool startsWith(const char* p) const { return s.rfind(p,0)==0; }
  const char* c_str() const { return s.c_str(); }
  unsigned int length() const { return (unsigned int)s.size(); }
  String operator+(const String& o) const { String r; r.s=s+o.s; return r; }
  String& operator+=(const String& o){ s+=o.s; return *this; }
  bool operator==(const char* o) const { return s==o; }
  String toString() const {return *this;}
  // Lo que pide la ArduinoJson real del String de Arduino
  bool concat(const char* c){ if(c) s+=c; return true; }
  String& operator=(const char* c){ s = c ? c : ""; return *this; }
  bool operator==(const String& o) const { return s==o.s; }
};
inline String operator+(const char* a, const String& b){ String r(a); return r+b; }
static unsigned long g_ms=0;
inline unsigned long millis(){ return g_ms; }
inline void delay(unsigned long){} inline void delayMicroseconds(unsigned long){}
inline int g_pin[64] = {0};
inline int g_cambios[64] = {0};   // cuántas veces cambió cada pin (para contar pulsos)
// Como el core ESP32 3.x: digitalWrite() antes de pinMode(OUTPUT) no hace nada, y pinMode(OUTPUT)
// habilita la salida con lo que tenga el registro (al arrancar, bajo). gpio_set_level() (ESP-IDF) sí
// carga el registro antes. g_bajoAlConfigurar cuenta las veces que un pin salió en bajo al configurarlo.
inline int  g_reg[64] = {0};
inline bool g_esSalida[64] = {false};
inline int  g_bajoAlConfigurar[64] = {0};
typedef int gpio_num_t;
inline void gpio_set_level(gpio_num_t p, int v){ if(p>=0&&p<64) g_reg[p] = v; }
inline void digitalWrite(int p,int v){ if(p>=0&&p<64&&g_esSalida[p]){ g_reg[p]=v; if(g_pin[p]!=v) g_cambios[p]++; g_pin[p]=v; } } inline int digitalRead(int p){ return (p>=0&&p<64) ? g_pin[p] : 0; } inline void pinMode(int p,int m){ if(p>=0&&p<64&&m==OUTPUT&&!g_esSalida[p]){ g_esSalida[p]=true; if(g_reg[p]==LOW) g_bajoAlConfigurar[p]++; if(g_pin[p]!=g_reg[p]) g_cambios[p]++; g_pin[p]=g_reg[p]; } }
inline int digitalPinToInterrupt(int p){return p;}
inline void attachInterrupt(int, void(*)(), int){}
inline void noInterrupts(){} inline void interrupts(){}
struct SerialT { void begin(int){} void println(const char*){} void println(const String&){} void print(const char*){}
  void printf(const char*, ...){} int available(){ return 0; } int read(){ return -1; } } static Serial;
typedef struct { int x; } portMUX_TYPE;
#define portMUX_INITIALIZER_UNLOCKED {0}
inline void portENTER_CRITICAL(portMUX_TYPE*){} inline void portEXIT_CRITICAL(portMUX_TYPE*){}
inline void portENTER_CRITICAL_ISR(portMUX_TYPE*){} inline void portEXIT_CRITICAL_ISR(portMUX_TYPE*){}
inline void vTaskDelay(int){} inline int pdMS_TO_TICKS(int x){return x;}
inline void xTaskCreatePinnedToCore(void(*)(void*), const char*, int, void*, int, void*, int){}
typedef int esp_err_t;
#define ESP_ERR_INVALID_STATE 259

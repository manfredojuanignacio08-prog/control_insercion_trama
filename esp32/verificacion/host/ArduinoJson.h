#pragma once
#include "Arduino.h"
struct JsonVar;
struct JsonArray { bool isNull() const {return false;} size_t size() const {return 0;} JsonVar operator[](int) const; };
struct JsonVar {
  template<class T> T as() const { return T(); }
  operator const char*() const { return ""; }
  JsonVar operator[](const char*) const { return JsonVar(); }
  template<class T> T operator|(T d) const { return d; }
  template<class T> JsonVar& operator=(T){ return *this; }
};
inline JsonVar JsonArray::operator[](int) const { return JsonVar(); }
template<> inline JsonArray JsonVar::as<JsonArray>() const { return JsonArray(); }
struct JsonDocument : JsonVar {};
struct DeserializationError { operator bool() const {return false;} const char* c_str() const {return "";} };
namespace DeserializationOption { struct F{}; inline F Filter(const JsonDocument&){return F();} }
inline DeserializationError deserializeJson(JsonDocument&, const String&){return DeserializationError();}
inline DeserializationError deserializeJson(JsonDocument&, const String&, DeserializationOption::F){return DeserializationError();}
inline void serializeJson(const JsonDocument&, String&){}

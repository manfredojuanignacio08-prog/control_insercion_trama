#pragma once
#include "WiFiClientSecure.h"
#include <map>
#include <vector>
// HTTP programable: cada URL (lo que va después de /api) devuelve el código y el cuerpo que diga la prueba.
struct Respuesta { int codigo; std::string cuerpo; };
inline std::map<std::string, Respuesta> g_resp;
inline std::vector<std::pair<std::string,std::string>> g_posts;   // (url, cuerpo)
inline std::vector<std::string> g_gets;                           // url de cada GET
struct HTTPClient {
  std::string url; Respuesta r{0, ""};
  bool begin(const String& u){ url=u.s; return true; } bool begin(WiFiClient&, const String& u){ url=u.s; return true; }
  void addHeader(const char*, const char*){} void setTimeout(int){} void setConnectTimeout(int){}
  Respuesta buscar(){ auto p = url.find("/api"); std::string k = url.substr(p); auto it = g_resp.find(k); return it==g_resp.end() ? Respuesta{404,""} : it->second; }
  int GET(){ g_gets.push_back(url); r = buscar(); return r.codigo; }
  int POST(const String& b){ g_posts.push_back({url, b.s}); r = buscar(); return r.codigo; }
  int POST(const char* b){ g_posts.push_back({url, b}); r = buscar(); return r.codigo; }
  String getString(){ String s; s.s = r.cuerpo; return s; } int getSize(){ return (int)r.cuerpo.size(); } void end(){} };

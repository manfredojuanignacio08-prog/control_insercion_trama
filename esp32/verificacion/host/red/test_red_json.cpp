// El firmware completo (Nivel 2) contra la ArduinoJson REAL y las respuestas que arma el backend
// real (payloads.h): descarga del dibujo con intercalado, posición retomada, selección pasada por
// pasada, consulta de estado (Marcha, Pausa, Retroceder, solo sensado) y reporte rechazado.
#include <cassert>
#include <cstdio>
#include <string>
#ifndef DESPLAZAMIENTO_FILAS_PRUEBA
#define DESPLAZAMIENTO_FILAS_PRUEBA 0
#endif
#include "/tmp/fw_red.cpp"   // el firmware con los prototipos (lo arma generar_prototipos.py)
#include "payloads.h"

static const int CANALES[4] = { 18, 19, 21, 22 };
static int canalEncendido() {   // -1 ninguno, -2 más de uno
  int c = -1;
  for (int i = 0; i < 4; i++) if (g_pin[CANALES[i]] == HIGH) c = (c == -1) ? i : -2;
  return c;
}
static void pulso() {            // una pasada del telar: flanco del sensor y vuelta del ciclo
  g_ms += 200; g_pin[35] = LOW; isrPasada(); loop();
  g_pin[35] = HIGH; g_ms += 1; loop();
}
static int pulsos(int pin) { return g_cambios[pin] / 2; }
static void resp(const std::string& k, int c, const std::string& b) { g_resp[k] = Respuesta{c, b}; }
static int fallas = 0;
#define VERIF(x) do { if (!(x)) { std::printf("  FALLA línea %d: %s\n", __LINE__, #x); fallas++; } } while (0)

int main() {
  g_pin[35] = HIGH; g_ms = 1000;
  setup();

  // ---- 1) Dibujo con intercalado, posición guardada a mitad del grupo ----
  resp("/api/telares/8/patron-actual", 200, P_INTERCALADO);
  VERIF(descargarDibujo());
  VERIF(hayDibujo && dibujoFilas == 5 && dibujoColumnas == 4);
  VERIF(repeticiones[0] == 3 && repeticiones[1] == 8 && repeticiones[2] == 0 && repeticiones[3] == 0 && repeticiones[4] == 2);
  VERIF(secuenciaLargo[1] == 4 && secuencia[1][0] == 2 && secuencia[1][1] == 3 && secuencia[1][2] == 3 && secuencia[1][3] == 4);
  VERIF(secuenciaLargo[0] == 0 && secuenciaLargo[4] == 0);
  VERIF(dibujo[0][0] && !dibujo[0][1] && dibujo[4][1]);
  VERIF(filaActual == 1 && repeticionesRestantes == 3);      // 8 del grupo, 5 hechas
  VERIF(sensorPasadaTotal() == 8 && patronCargado == 7 && produccionCargada == 41);

  // ---- 2) Pasada por pasada: el resto del grupo, la fila 4 y la vuelta a la fila 0 ----
  tejiendo = true; loop();
  // grupo: pasadas 5, 6 y 7 → ciclo [2,3,3,4] índices 1, 2, 3 → bobinas 3, 3, 4
  // fila 4 (bobina 2) ×2 · fila 0 (bobina 1) ×3 · grupo otra vez desde el principio → 2, 3, 3, 4
  // Con DESPLAZAMIENTO_FILAS se aplica la selección de la pasada corrida esa cantidad de PASADAS.
#if DESPLAZAMIENTO_FILAS_PRUEBA == 1
  const int esperado[] = { 2, 3, 1, 1, 0, 0, 0, 1, 2, 2, 3, 1 };
#elif DESPLAZAMIENTO_FILAS_PRUEBA == -1
  const int esperado[] = { 1, 2, 2, 3, 1, 1, 0, 0, 0, 1, 2, 2 };
#else
  const int esperado[] = { 2, 2, 3, 1, 1, 0, 0, 0, 1, 2, 2, 3 };   // canal 0..3
#endif
  for (int k = 0; k < 12; k++) {
    pulso();
    if (canalEncendido() != esperado[k]) std::printf("  pasada %d: canal %d, esperado %d\n", k, canalEncendido(), esperado[k]);
    VERIF(canalEncendido() == esperado[k]);
  }
  VERIF(sensorPasadaTotal() == 20);

  // ---- 3) Reporte de pasadas: cuerpo JSON y respuesta aceptada ----
  g_posts.clear();
  resp("/api/telares/8/pasadas", 200, "{\"aplicado\":true,\"pasadas_sensor\":20}");
  reportarPasadas();
  VERIF(g_posts.size() == 1);
  {
    JsonDocument b; VERIF(!deserializeJson(b, g_posts[0].second));
    VERIF(b["pasadas_sensor"].as<long>() == 20 && b["fila_actual"].as<int>() == filaActual &&
          b["repeticion_en_fila"].as<int>() == repeticiones[filaActual] - repeticionesRestantes);
    VERIF(b["historial_id"].is<long>() && b["historial_id"].as<long>() == 41);   // la producción para la que cuenta
  }
  VERIF(totalReportado == 20);
  // Rechazado: se readoptan conteo y posición
  resp("/api/telares/8/pasadas", 200, "{\"aplicado\":false,\"motivo\":\"x\",\"pasadas_sensor\":3}");
  reportarPasadas();
  VERIF(sensorPasadaTotal() == 3 && totalReportado == 3 && volverABajarDibujo);
  volverABajarDibujo = false;

  // ---- 4) Consulta de estado: primera lectura, Pausa, Retroceder, solo sensado ----
  tejiendo = false; loop();
  const std::string tel = "/api/telares/8?origen=nivel2";
  auto estado = [&](const char* e, int seq, int rc, bool control) {
    char b[256];
    std::snprintf(b, sizeof b, "{\"id\":8,\"estado\":\"%s\",\"patron_actual_id\":7,\"historial_actual_id\":41,"
                  "\"retrocesos_contados\":%d,\"retroceder_seq\":%d,\"control_web_activo\":%s,\"nombre\":\"Telar\"}",
                  e, rc, seq, control ? "true" : "false");
    resp(tel, 200, b);
  };
  for (int i = 0; i < 64; i++) g_cambios[i] = 0;
  g_ms += 5000; estado("tejiendo", 4, 2, true); consultarEstado();   // primera lectura: solo memoriza
  VERIF(estadoDeseado == 1 && retrocederSeqConocido == 4 && retrocesosVisto == 2);
  VERIF(pulsos(25) + pulsos(26) + pulsos(27) == 0);
  VERIF(tejiendo && controlWebActivo);
  g_ms += 2500; estado("pausado", 4, 2, true); consultarEstado();    // pausa desde la web
  VERIF(pulsos(26) == 1 && !tejiendo);
  g_ms += 2500; estado("pausado", 5, 3, true); consultarEstado();    // un retroceso pedido desde la web
  VERIF(pulsos(27) == 1 && retrocesosVisto == 3);
  g_ms += 2500; estado("tejiendo", 5, 3, false); consultarEstado();  // solo sensado: no se pulsa Marcha
  VERIF(!controlWebActivo && pulsos(25) == 0 && estadoDeseado == 1);
  // Otra producción del mismo dibujo (⏹ y ▶ seguidos): se vuelve a bajar
  resp("/api/telares/8/patron-actual", 200, P_SINPOSICION);
  g_ms += 2500;
  {
    char b[256];
    std::snprintf(b, sizeof b, "{\"estado\":\"tejiendo\",\"patron_actual_id\":9,\"historial_actual_id\":0,"
                  "\"retrocesos_contados\":3,\"retroceder_seq\":5,\"control_web_activo\":true}");
    resp(tel, 200, b);
  }
  consultarEstado();
  VERIF(patronCargado == 9 && filaActual == 0 && repeticionesRestantes == 100 && sensorPasadaTotal() == 0);
  VERIF(produccionCargada == 0);
  // Ese dibujo se bajó sin producción abierta. El telar teje y cuenta; después empieza una
  // producción (▶): tiene que volver a bajarse, o la producción heredaría el conteo de la placa.
  tejiendo = true; loop();
  for (int k = 0; k < 7; k++) pulso();
  VERIF(sensorPasadaTotal() == 7);
  {
    char b[256];
    std::snprintf(b, sizeof b, "{\"estado\":\"tejiendo\",\"patron_actual_id\":9,\"historial_actual_id\":55,"
                  "\"retrocesos_contados\":3,\"retroceder_seq\":5,\"control_web_activo\":true}");
    resp(tel, 200, b);
  }
  std::string nueva = P_SINPOSICION;   // la producción 55 recién creada: fila 0, conteo 0
  nueva.replace(nueva.find("\"historial_id\":null"), 19, "\"historial_id\":55");
  nueva.replace(nueva.find("\"pasadas_sensor\":null"), 21, "\"pasadas_sensor\":0");
  nueva.replace(nueva.find("\"fila_actual\":null"), 18, "\"fila_actual\":0");
  resp("/api/telares/8/patron-actual", 200, nueva);
  g_gets.clear(); g_ms += 2500; consultarEstado();
  VERIF(g_gets.size() == 2);                       // la consulta y la descarga del dibujo
  VERIF(produccionCargada == 55 && sensorPasadaTotal() == 0 && filaActual == 0 && repeticionesRestantes == 100);
  g_gets.clear(); g_ms += 2500; consultarEstado();
  VERIF(g_gets.size() == 1);                       // ya está al día: no se vuelve a bajar
  tejiendo = false; loop();

  // ---- 5) Evento físico: el estado que devuelve el backend se adopta ----
  resp("/api/telares/8/evento-fisico", 200, "{\"ok\":true,\"estado\":\"pausado\",\"tipo\":\"pausa\"}");
  estadoDeseado = 1;
  VERIF(reportarEventoFisico("pausa") && estadoDeseado == 0);
  // Retroceder en la botonera con el telar en pausa: el sensor ya contó el pulso hacia adelante. La
  // respuesta del evento trae el contador sumado y el pulso se reclasifica ahí mismo, sin esperar la
  // consulta siguiente (que podía dejarlo fuera de la ventana).
  {
    tejiendo = false; loop();
    sensorPasadaFijarTotal(10);                       // (en 0 el conteo no baja de 0)
    const unsigned long antes = sensorPasadaTotal();
    int f = filaActual, r = repeticionesRestantes;
    posicionAtras(f, r, repeticiones, dibujoFilas);   // donde tiene que quedar: una pasada atrás
    pulso();
    VERIF(sensorPasadaTotal() == antes + 1);
    resp("/api/telares/8/evento-fisico", 200, "{\"id\":8,\"estado\":\"pausado\",\"retrocesos_contados\":4}");
    g_ms += 3000;
    VERIF(reportarEventoFisico("retroceder") && retrocesosVisto == 4);
    loop();
    VERIF(sensorPasadaTotal() == antes - 1 && filaActual == f && repeticionesRestantes == r);
    resp(tel, 200, "{\"estado\":\"pausado\",\"patron_actual_id\":9,\"historial_actual_id\":55,"
                   "\"retrocesos_contados\":4,\"retroceder_seq\":5,\"control_web_activo\":true}");
    g_ms += 2500; consultarEstado();                  // la consulta siguiente no lo cuenta de nuevo
    VERIF(retrocesosVisto == 4 && sensorPasadaTotal() == antes - 1);
  }

  // ---- 6) Sin dibujo asignado ----
  resp("/api/telares/8/patron-actual", 200, P_VACIO);
  VERIF(!descargarDibujo() && !hayDibujo);

  if (fallas) { std::printf("Red y JSON (ArduinoJson real): %d fallas\n", fallas); return 1; }
  std::printf("  Red y JSON con la ArduinoJson real: OK\n");
  return 0;
}

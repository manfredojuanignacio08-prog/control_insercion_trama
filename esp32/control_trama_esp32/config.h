/*
 * config.h, Configuración del dispositivo
 *
 * Completar estos valores ANTES de subir el sketch a la placa.
 * Este archivo está separado del .ino para poder compartir el código sin
 * exponer la contraseña del Wi-Fi.
 */

#ifndef CONFIG_H
#define CONFIG_H

// ---- Red Wi-Fi a la que se conecta el ESP32 ----
// ---------------------------------------------------------------------------
//  REDES WiFi
//
//  El nodo intenta primero la red de la fábrica. Si no la encuentra o no logra
//  conectarse, prueba la segunda, pensada para el teléfono del dueño compartiendo
//  datos. Así una caída del router no deja al sistema sin comunicación: basta con
//  encender el punto de acceso del celular y el nodo se engancha solo.
//
//  ATENCIÓN: este archivo va al repositorio. Si el repositorio es público, la
//  contraseña queda a la vista de cualquiera. Ver la nota al pie de este bloque.
// ---------------------------------------------------------------------------
#define WIFI_SSID          "Claro3747"
#define WIFI_PASSWORD      "11335577"

// Red de respaldo: punto de acceso del celular. Cuando se conozcan el nombre y la
// clave que use el dueño, se completan acá. Si quedan vacíos, el nodo simplemente
// reintenta la red principal.
#define WIFI_SSID_ALT      ""
#define WIFI_PASSWORD_ALT  ""

// Segundos que espera en cada red antes de pasar a la otra.
#define WIFI_ESPERA_SEG    15

// ---------------------------------------------------------------------------
//  SOBRE LA CONTRASEÑA Y EL REPOSITORIO
//
//  Este archivo contiene la clave real de la red de la fábrica. Si el repositorio
//  de GitHub es público, cualquiera puede leerla, y quien la tenga entra a la red
//  donde vive el backend y el resto de las computadoras de la planta.
//
//  Tres formas de resolverlo, de menos a más trabajo:
//
//  1) Poner el repositorio en privado. Es lo más rápido.
//  2) Dejar este archivo fuera del control de versiones: agregarlo a .gitignore
//     y versionar en su lugar un config.ejemplo.h con las claves en blanco.
//     Cada integrante copia el ejemplo y completa sus datos.
//  3) Pedirle al dueño una red separada para los equipos del telar, aislada de
//     la administrativa. Es lo correcto en una planta, más allá del repositorio.
//
//  Mientras tanto, conviene al menos que la clave del WiFi no se repita en
//  ningún otro servicio de la fábrica.
// ---------------------------------------------------------------------------


// ---- Dónde está corriendo el backend Node.js ----
// SIN barra final. Ejemplos:
//   - Backend corriendo en una PC de la misma red:  "http://192.168.1.50:3000"
//   - Backend desplegado en la nube con dominio:    "https://tu-backend.onrender.com"
//
// OJO: tiene que ser la URL del BACKEND (Node/Express), NO la de la base de datos.
// El ESP32 nunca habla directo con la base de datos: siempre pasa por la
// API, igual que la web y la app, así todas las reglas de negocio
// (transacciones, validaciones, bloqueos) se aplican también al hardware.
#define API_BASE_URL  "http://192.168.1.50:3000"

// ---- Qué telar controla ESTE dispositivo ----
// Por ahora hay un solo telar (id 1). Si en el futuro hay varios, cada
// ESP32 lleva grabado el id del telar físico al que está conectado.
// OJO: tiene que coincidir con el telar que la web está mostrando. Hoy la
// web usa el PRIMER telar de la base (telares[0]), que con una sola máquina
// creada es el id 1. Si algún día se crea otro telar, o se borra y recrea el
// primero (el id es SERIAL, no se reutiliza), este número puede quedar
// apuntando a un telar distinto del que se ve en pantalla: la web mostraría
// un estado y el ESP32 estaría accionando otro. Verificar en ese caso.
#define TELAR_ID      1

// ---- Polaridad de CADA módulo de relé ----
// La mayoría de los módulos optoacoplados de 5V se activan con nivel BAJO
// (LOW en el pin IN = relé cerrado) → true. Los módulos de un solo canal
// con pines rotulados "S / + / -" suelen ser al revés: se activan con
// nivel ALTO → false.
//
// Cómo saberlo, con el módulo alimentado y el pin de señal al aire:
// si el relé queda SUELTO, es activo-bajo (true); si queda PEGADO (con el
// LED encendido), es activo-alto (false).
//
// IMPORTANTE, la resistencia de cada canal depende de esto:
//   activo-bajo (true)  → pull-UP de 10 kΩ a 3.3V  (lo mantiene suelto)
//   activo-alto (false) → pull-DOWN de 10 kΩ a GND (lo mantiene suelto)
// Si se pone la resistencia al revés, el relé arranca PEGADO.
//
// En este equipo conviven los dos tipos: el módulo de 2 canales
// (Marcha/Pausa) es activo-bajo, y el módulo individual de Retroceder
// resultó activo-alto.
#define RELE_MARCHA_ACTIVO_BAJO      true
#define RELE_PAUSA_ACTIVO_BAJO       true
#define RELE_RETROCEDER_ACTIVO_BAJO  false

#endif

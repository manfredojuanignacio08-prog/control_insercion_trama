/*
 * config.h — Configuración del dispositivo
 *
 * Completar estos valores ANTES de subir el sketch a la placa.
 * Este archivo está separado del .ino para poder compartir el código sin
 * exponer la contraseña del Wi-Fi.
 */

#ifndef CONFIG_H
#define CONFIG_H

// ---- Red Wi-Fi a la que se conecta el ESP32 ----
#define WIFI_SSID     "NOMBRE_DE_TU_RED"
#define WIFI_PASSWORD "PASSWORD_DE_TU_RED"

// ---- Dónde está corriendo el backend Node.js ----
// SIN barra final. Ejemplos:
//   - Backend corriendo en una PC de la misma red:  "http://192.168.1.50:3000"
//   - Backend desplegado en la nube con dominio:    "https://tu-backend.onrender.com"
//
// OJO: tiene que ser la URL del BACKEND (Node/Express), NO la de la base de datos.
// El ESP32 nunca habla directo con la base de datos: siempre pasa por la
// API, igual que la web y la app — así todas las reglas de negocio
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
// IMPORTANTE — la resistencia de cada canal depende de esto:
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

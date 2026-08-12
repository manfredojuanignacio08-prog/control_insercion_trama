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
// OJO: tiene que ser la URL del BACKEND (Node/Express), NO la de Supabase.
// El ESP32 nunca habla directo con la base de datos: siempre pasa por la
// API, igual que la web y la app — así todas las reglas de negocio
// (transacciones, validaciones, bloqueos) se aplican también al hardware.
#define API_BASE_URL  "http://192.168.1.50:3000"

// ---- Qué telar controla ESTE dispositivo ----
// Por ahora hay un solo telar (id 1). Si en el futuro hay varios, cada
// ESP32 lleva grabado el id del telar físico al que está conectado.
#define TELAR_ID      1

// ---- Polaridad del módulo de relés ----
// La MAYORÍA de los módulos de relé optoacoplados de 5V se activan con
// nivel BAJO (LOW en el pin IN = relé cerrado) → dejar en true.
// Si tu módulo se activa con nivel ALTO, poné false.
// Cómo saberlo: con el módulo alimentado y el pin IN al aire o a 3.3V,
// el relé debe estar SUELTO; si está pegado, es activo-alto → false.
#define RELE_ACTIVO_BAJO  true

#endif

// Arma la respuesta REAL de GET /api/telares/:id/patron-actual con el controlador del backend
// (la base se reemplaza por una fila fija). Uso, desde esta carpeta:  node gen_payload.mjs > payloads.h
import { pool } from '../../../../backend/src/db.js';
import { obtenerPatronActual } from '../../../../backend/src/nivel2/nivel2.controller.js';
const casos = {
  // 5 filas × 4 bobinas: fila 0 bobina 1 ×3; filas 1-3 intercaladas (2 ×1, 3 ×2, 4 ×1); fila 4 bobina 2 ×2
  intercalado: { id: 7, nombre: 'P', filas: 5, columnas: 4,
    matriz_pasadas: [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1],[0,1,0,0]],
    repeticiones_por_fila: [3,1,2,1,2], grupos_intercalados: [{ desde: 1, hasta: 3, pasadas: 8 }],
    historial_id: 41, fila_actual: 1, repeticion_en_fila: 5, pasadas_sensor: 8 },
  sinPosicion: { id: 9, nombre: 'Q', filas: 2, columnas: 4,
    matriz_pasadas: [[0,0,1,0],[0,0,0,1]], repeticiones_por_fila: [100,50], grupos_intercalados: null,
    historial_id: null, fila_actual: null, repeticion_en_fila: null, pasadas_sensor: null },
};
const out = {};
for (const [k, fila] of Object.entries(casos)) {
  pool.query = async () => ({ rows: [fila] });
  await obtenerPatronActual({ params: { id: '8' } }, { json: (b) => { out[k] = b; } }, (e) => { throw e; });
}
pool.query = async () => ({ rows: [] });
await obtenerPatronActual({ params: { id: '8' } }, { json: (b) => { out.vacio = b; } }, (e) => { throw e; });
// Como cadenas de C: JSON.stringify de la respuesta, y otra vez para escaparla entre comillas.
const nombres = { intercalado: 'P_INTERCALADO', sinPosicion: 'P_SINPOSICION', vacio: 'P_VACIO' };
console.log('// Generado con el controlador real del backend (gen_payload.mjs)');
for (const [k, n] of Object.entries(nombres)) console.log(`static const char* ${n} = ${JSON.stringify(JSON.stringify(out[k]))};`);
await pool.end();

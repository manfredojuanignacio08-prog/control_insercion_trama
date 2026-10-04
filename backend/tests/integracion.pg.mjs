// ============================================================================
//  Prueba de INTEGRACIÓN: el servidor real contra un PostgreSQL real (no forma parte de
//  "npm test", que no necesita base). Valida el SQL de punta a punta: telar, dibujos,
//  conductor del reloj, eventos de los ESP32, reportes del sensor, invitaciones.
//
//  Usar SIEMPRE una base de PRUEBA vacía: la prueba crea y borra datos.
//    1) createdb trama_prueba
//    2) PGDATABASE=trama_prueba npm run init-db && PGDATABASE=trama_prueba npm run migrate
//    3) PGDATABASE=trama_prueba SESSION_SECRET=0123456789abcdef0123456789abcdef0123 \
//       RECOVERY_SECRET=recuperacion-secreta-123 ESP32_DEVICE_KEY=clave-dispositivo PORT=3999 npm start
//    4) en otra terminal:  PGDATABASE=trama_prueba node tests/integracion.pg.mjs
//  (PGHOST, PGPORT y PGUSER se toman del entorno, igual que el servidor; usa el comando psql.)
// ============================================================================
import assert from 'assert';
import { execSync } from 'child_process';
process.env.SESSION_SECRET = '0123456789abcdef0123456789abcdef0123';
const { emitirSesion } = await import('../src/middleware/auth.js');
const B = (process.env.API_PRUEBA || 'http://localhost:3999') + '/api';
const psql = (q) => execSync(`psql -Atc "${q}"`).toString().trim();   // usa PGHOST, PGPORT, PGUSER, PGDATABASE
function cookie(usuario, invitado=false) { let c; emitirSesion({}, { append:(k,v)=>{ c=v; } }, { usuario, nombre:usuario, invitado }); return c.split(';')[0]; }
const OP = cookie('ana'); const INV = cookie('invitado', true); const DEV = 'clave-dispositivo';
async function api(m, path, body, { ck=OP, dev=false, headers={} } = {}) {
  const h = { 'Content-Type':'application/json', ...headers };
  if (ck) h.Cookie = ck; if (dev) h['X-Device-Key'] = DEV;
  const r = await fetch(B+path, { method:m, headers:h, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { s:r.status, b:j };
}
let r;
// sin sesión → 401; cookie mal codificada → 401 (antes 500)
r = await api('GET','/telares',null,{ck:null}); assert.equal(r.s,401);
r = await api('GET','/telares',null,{ck:'trama_sesion=%E0%A4%A'}); assert.equal(r.s,401, JSON.stringify(r));
// alta de telar y dibujo
r = await api('POST','/telares',{codigo:'TELAR-01',nombre:'Principal'}); assert.equal(r.s,201); const T = r.b.id;
r = await api('POST','/telares',{codigo:'X'},{ck:INV}); assert.equal(r.s,403);
const MAT = [[1,0,1,0],[0,1,0,1],[1,1,0,0]];
r = await api('POST','/patrones',{nombre:'Raya',filas:3,columnas:4,matriz_pasadas:MAT,repeticiones_por_fila:[2,1,3]}); assert.equal(r.s,201); const P = r.b.id;
r = await api('POST','/patrones',{nombre:'Mala',filas:3,columnas:4,matriz_pasadas:MAT,matriz_ligamento:[[2]]}); assert.equal(r.s,400);
// asignar → tejiendo; el ESP32 lo ve
r = await api('POST',`/telares/${T}/asignar-patron`,{patron_id:P}); assert.equal(r.s,201);
r = await api('GET',`/telares/${T}?origen=esp32`,null,{ck:null,dev:true}); assert.equal(r.b.estado,'tejiendo'); assert.equal(r.b.retroceder_seq,0);
r = await api('GET',`/telares/${T}`); assert.equal(typeof r.b.segundos_desde_ping,'number'); assert(r.b.segundos_desde_ping < 5, String(r.b.segundos_desde_ping));
// avanzar con conductor
r = await api('POST',`/telares/${T}/avanzar`,{pasos:1,cliente:'A'}); assert.equal(r.s,200); assert.equal(r.b.fila_actual,0); assert.equal(r.b.repeticion_en_fila,1);
r = await api('POST',`/telares/${T}/avanzar`,{pasos:1,cliente:'B'}); assert.equal(r.s,409); assert.equal(r.b.codigo,'OTRO_CONDUCTOR');
r = await api('POST',`/telares/${T}/avanzar`,{pasos:1,cliente:'A'}); assert.equal(r.b.fila_actual,1); assert.equal(r.b.repeticion_en_fila,0);
r = await api('POST',`/telares/${T}/avanzar`,{pasos:1e9,cliente:'A'}); assert.equal(r.s,400);
// cambiar repeticiones con la producción abierta → 409
r = await api('PUT',`/patrones/${P}`,{nombre:'Raya',filas:3,columnas:4,matriz_pasadas:MAT,repeticiones_por_fila:[2,1,4]}); assert.equal(r.s,409); assert.equal(r.b.codigo,'PATRON_EN_PRODUCCION');
r = await api('PUT',`/patrones/${P}`,{nombre:'Raya azul',filas:3,columnas:4,matriz_pasadas:MAT,repeticiones_por_fila:[2,1,3]}); assert.equal(r.s,200);
// pausar / retroceder / reanudar
r = await api('POST',`/telares/${T}/pausar`); assert.equal(r.b.estado,'pausado');
// pausado, el reloj no suma (antes una pantalla en otra sección seguía contando con la máquina parada)
r = await api('POST',`/telares/${T}/avanzar`,{pasos:1,cliente:'A'}); assert.equal(r.s,409); assert.equal(r.b.codigo,'TELAR_NO_TEJIENDO'); assert.equal(r.b.fila_actual,1);
r = await api('POST',`/telares/${T}/retroceder`,{pasos:1}); assert.equal(r.b.fila_actual,0); assert.equal(r.b.repeticion_en_fila,1);
r = await api('POST',`/telares/${T}/retroceder-fisico`); assert.equal(r.b.retroceder_seq,1); assert.equal(r.b.retrocesos_contados,1);
r = await api('POST',`/telares/${T}/reanudar`); assert.equal(r.b.estado,'tejiendo');
// eventos físicos (solo dispositivo)
r = await api('POST',`/telares/${T}/evento-fisico`,{tipo:'pausa'}); assert.equal(r.s,401);
r = await api('POST',`/telares/${T}/evento-fisico`,{tipo:'pausa'},{ck:null,dev:true}); assert.equal(r.b.estado,'pausado');
r = await api('POST',`/telares/${T}/evento-fisico`,{tipo:'marcha'},{ck:null,dev:true}); assert.equal(r.b.estado,'tejiendo');
r = await api('POST',`/telares/${T}/evento-fisico`,{tipo:'reinicio'},{ck:null,dev:true}); assert.equal(r.b.estado,'pausado'); assert.equal(r.b.motivo_pausa,'reinicio');
r = await api('POST',`/telares/${T}/evento-fisico`,{tipo:'retroceder'},{ck:null,dev:true}); assert.equal(r.s,200);
let h = psql(`select fila_actual||','||repeticion_en_fila from historial_produccion where estado='en_curso'`); assert.equal(h,'0,0', 'sin sensor el retroceso manual mueve la posición');
// Nivel 2: patrón actual y reportes del sensor
r = await api('GET',`/telares/${T}/patron-actual`,null,{ck:null,dev:true}); assert.equal(r.b.asignado,true); assert.deepEqual(r.b.repeticiones_por_fila,[2,1,3]);
r = await api('POST',`/telares/${T}/pasadas`,{pasadas_sensor:3,fila_actual:1,repeticion_en_fila:0},{ck:null,dev:true}); assert.equal(r.b.aplicado,true, JSON.stringify(r));
r = await api('POST',`/telares/${T}/pasadas`,{pasadas_sensor:4,fila_actual:2,repeticion_en_fila:0},{ck:null,dev:true}); assert.equal(r.b.aplicado,true, JSON.stringify(r));
r = await api('POST',`/telares/${T}/pasadas`,{pasadas_sensor:2147483648},{ck:null,dev:true}); assert.equal(r.s,400);
// con el sensor llevando la producción, tres retrocesos manuales NO mueven la posición en el backend;
// el nodo reporta su conteo y posición, y el backend los ACEPTA (antes los rechazaba con 400)
for (let i=0;i<3;i++) { r = await api('POST',`/telares/${T}/evento-fisico`,{tipo:'retroceder'},{ck:null,dev:true}); assert.equal(r.s,200); }
h = psql(`select fila_actual||','||repeticion_en_fila from historial_produccion where estado='en_curso'`); assert.equal(h,'2,0');
r = await api('POST',`/telares/${T}/pasadas`,{pasadas_sensor:1,fila_actual:0,repeticion_en_fila:1},{ck:null,dev:true}); assert.equal(r.s,200, JSON.stringify(r)); assert.equal(r.b.aplicado,true);
r = await api('GET',`/telares/${T}`,null,{ck:null,dev:true}); assert.equal(r.b.retrocesos_contados,5); assert.equal(r.b.sensor_activo,true);
// con el sensor activo la web no avanza por reloj
r = await api('POST',`/telares/${T}/avanzar`,{pasos:1,cliente:'A'}); assert.equal(r.s,409); assert.equal(r.b.codigo,'SENSOR_ACTIVO');
// estadísticas, metros, historial, errores
r = await api('PUT',`/patrones/${P}/metros-por-pasada`,{metros_por_pasada:0.0005}); assert.equal(r.s,200);
r = await api('GET',`/patrones/${P}/estadisticas`); assert.equal(r.s,200); assert.equal(r.b.producciones,1);
r = await api('GET',`/historial?telar_id=${T}`); assert.equal(r.s,200); assert.equal(r.b.length,1);
r = await api('GET',`/historial?desde=no-es-fecha`); assert.equal(r.s,400);
r = await api('POST','/errores',{telar_id:T,titulo:'prueba',codigo:'X'},{ck:null,dev:true}); assert.equal(r.s,201);
r = await api('POST','/errores',{titulo:'x'},{ck:INV}); assert.equal(r.s,403);
// terminar trabajo; pausar un telar apagado lo deja apagado
r = await api('POST',`/telares/${T}/detener`,{alertas_disparadas:'mucho'}); assert.equal(r.s,400);
r = await api('POST',`/telares/${T}/detener`,{}); assert.equal(r.s,200);
r = await api('POST',`/telares/${T}/pausar`); assert.equal(r.b.estado,'apagado');
r = await api('DELETE',`/patrones/${P}`); assert.equal(r.s,409);
// Nivel 2 instalado, telar quieto más de 30 s (el nodo no reporta pasadas, pero consulta cada
// 2,5 s): su consulta lo mantiene "activo", así que al tocar ▶ la web NO avanza por reloj y el
// primer reporte del sensor coincide con la posición guardada. Antes la web avanzaba unas pasadas
// mientras la máquina arrancaba y el backend rechazaba ese reporte y todos los siguientes.
r = await api('POST','/telares',{codigo:'TELAR-02'}); assert.equal(r.s,201); const T2 = r.b.id;
r = await api('POST',`/telares/${T2}/asignar-patron`,{patron_id:P}); assert.equal(r.s,201);
r = await api('POST',`/telares/${T2}/avanzar`,{pasos:1,cliente:'W'}); assert.equal(r.s,200, 'sin nodo, la web estima por reloj');
psql(`update telares set ultimo_reporte_sensor = now() - interval '5 minutes' where id=${T2}`);
r = await api('GET',`/telares/${T2}?origen=nivel2`,null,{ck:null,dev:true}); assert.equal(r.s,200);
r = await api('GET',`/telares/${T2}`); assert.equal(r.b.sensor_activo,true, 'la consulta del nodo es su señal de vida');
r = await api('POST',`/telares/${T2}/avanzar`,{pasos:1,cliente:'W'}); assert.equal(r.s,409); assert.equal(r.b.codigo,'SENSOR_ACTIVO');
r = await api('GET',`/telares/${T2}/patron-actual`,null,{ck:null,dev:true}); assert.equal(r.b.fila_actual,0); assert.equal(r.b.repeticion_en_fila,1);
r = await api('POST',`/telares/${T2}/pasadas`,{pasadas_sensor:2,fila_actual:1,repeticion_en_fila:1},{ck:null,dev:true}); assert.equal(r.b.aplicado,true, JSON.stringify(r));
// el nodo pierde la red: la producción sigue siendo del sensor (tiene pasadas medidas) y el reloj no la toca
psql(`update telares set ultimo_reporte_sensor = now() - interval '5 minutes' where id=${T2}`);
r = await api('POST',`/telares/${T2}/avanzar`,{pasos:1,cliente:'W'}); assert.equal(r.s,409); assert.equal(r.b.codigo,'SENSOR_ACTIVO');
r = await api('POST',`/telares/${T2}/retroceder`,{pasos:1}); assert.equal(r.s,409);
// al volver, su reporte (siguió contando) coincide y se acepta
r = await api('POST',`/telares/${T2}/pasadas`,{pasadas_sensor:9,fila_actual:2,repeticion_en_fila:2},{ck:null,dev:true}); assert.equal(r.b.aplicado,true, JSON.stringify(r));
// cambio de vuelta: guardado en la última pasada de la vuelta (6 por vuelta: 2+1+3); el conteo ya
// sumó una pero la fila se leyó un instante antes y sigue en la última. Es una pasada de
// diferencia, no una vuelta entera: se acepta (antes se rechazaba).
r = await api('POST',`/telares/${T2}/pasadas`,{pasadas_sensor:10,fila_actual:2,repeticion_en_fila:2},{ck:null,dev:true}); assert.equal(r.b.aplicado,true, JSON.stringify(r));
r = await api('POST',`/telares/${T2}/pasadas`,{pasadas_sensor:11,fila_actual:0,repeticion_en_fila:0},{ck:null,dev:true}); assert.equal(r.b.aplicado,true, JSON.stringify(r));
// pedidos simultáneos que antes tomaban los bloqueos en orden opuesto: ninguno termina en error 500
for (let i = 0; i < 15; i++) {
  const par = await Promise.all([
    api('POST',`/telares/${T2}/evento-fisico`,{tipo:'pausa'},{ck:null,dev:true}),
    api('POST',`/telares/${T2}/pasadas`,{pasadas_sensor:11,fila_actual:0,repeticion_en_fila:0},{ck:null,dev:true}),
  ]);
  assert(par.every(x => x.s === 200), JSON.stringify(par));
}
for (let i = 0; i < 15; i++) {
  const par = await Promise.all([
    api('POST',`/telares/${T2}/detener`,{}),
    api('POST',`/telares/${T2}/asignar-patron`,{patron_id:P}),
    api('POST',`/telares/${T2}/reanudar`),
  ]);
  assert(par.every(x => [200,201,409].includes(x.s)), JSON.stringify(par.map(x=>x.s)));
  const est = psql(`select t.estado||','||(select count(*) from historial_produccion h where h.telar_id=t.id and h.estado='en_curso') from telares t where id=${T2}`);
  assert(est === 'apagado,0' || est === 'tejiendo,1', 'nunca "tejiendo" sin trabajo abierto: ' + est);
}
r = await api('POST',`/telares/${T2}/detener`,{});
r = await api('POST',`/telares/${T2}/reanudar`); assert.equal(r.s,409);
psql(`update telares set ultimo_reporte_sensor = null where id=${T2}`);
r = await api('POST',`/telares/${T2}/avanzar`,{pasos:1,cliente:'W'}); assert.equal(r.s,409); assert.equal(r.b.codigo,'SIN_TRABAJO');
r = await api('POST','/telares/987654/reanudar'); assert.equal(r.s,404);
// registro: 3 libres, el 4.º necesita invitación; una invitación sirve UNA vez aunque lleguen dos a la vez
const reg = (usuario, invitacion) => api('POST','/auth/registro/iniciar',{usuario, invitacion},{ck:null, headers:{Origin:'http://localhost:3999'}});
for (const u of ['uno','dos','tres']) { r = await reg(u); assert.equal(r.s,200, JSON.stringify(r)); }
r = await reg('cuatro'); assert.equal(r.s,403); assert.equal(r.b.requiere_invitacion,true);
psql(`insert into credenciales_biometricas (usuario_id, credential_id, public_key) select id,'cred-uno','pk' from usuarios where usuario='uno'`);
r = await api('POST','/auth/invitacion',null,{ck:cookie('uno')}); assert.equal(r.s,201); const codigo = r.b.codigo;
const [a1, a2] = await Promise.all([reg('cuatro', codigo), reg('cinco', codigo)]);
assert.deepEqual([a1.s, a2.s].sort(), [200, 403], `una invitación, dos registros simultáneos: ${a1.s} ${a2.s}`);
assert.equal(psql(`select count(*) from usuarios`), '4');
r = await api('POST','/auth/registro/iniciar',{usuario:'seis',nombre:{x:1}},{ck:null}); assert.equal(r.s,400);
console.log('integración contra PostgreSQL real: OK');

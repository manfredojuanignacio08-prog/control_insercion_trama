// Prueba de los controladores SIN base de datos real: se copia src/ a una carpeta temporal y se
// reemplaza db.js por un "pool" falso que responde a cada consulta según un guion. Sirve para
// detectar errores de lógica y de JavaScript (variables mal usadas, parámetros cambiados, flujos
// que no llegan a donde deberían). NO reemplaza probar contra PostgreSQL: no valida el SQL.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const aqui = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'trama-test-'));
fs.cpSync(path.join(aqui, '..', 'src'), path.join(tmp, 'src'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'package.json'), '{"type":"module"}');
fs.writeFileSync(path.join(tmp, 'src', 'db.js'), "// Stub de pool para pruebas: las consultas las resuelve globalThis.__q\nconst run = async (sql, params) => { globalThis.__log.push({ sql: sql.replace(/\\s+/g,' ').trim(), params }); return globalThis.__q(sql.replace(/\\s+/g,' ').trim(), params) || { rows: [], rowCount: 0 }; };\nexport const pool = { query: run, async connect() { return { query: run, release() {} }; } };\n");
const imp = (rel) => import(pathToFileURL(path.join(tmp, rel)).href);
import assert from 'assert';
const T = await imp('src/controllers/telares.controller.js');
const P = await imp('src/controllers/patrones.controller.js');
const N = await imp('src/nivel2/nivel2.controller.js');
function res() { return { code: 200, body: null, status(c){this.code=c;return this}, json(b){this.body=b;return this} }; }
async function call(fn, req) { globalThis.__log=[]; const r=res(); let err=null; await fn({ params:{}, body:{}, query:{}, ...req }, r, (e)=>{err=e}); return { r, err, log: globalThis.__log }; }
const MAT = [[1,0,1,0],[0,1,0,1],[1,1,0,0],[0,0,1,1]];

// 1) reinicio con producción abierta
globalThis.__q = (sql) => {
  if (/FROM telares WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows:[{id:8, estado:'tejiendo'}] };
  if (/FROM historial_produccion h JOIN patrones/.test(sql)) return { rows:[{id:5, fila_actual:2, matriz_pasadas:MAT}] };
  if (/SET estado = 'pausado', motivo_pausa = 'reinicio'/.test(sql)) return { rows:[{id:8, estado:'pausado', motivo_pausa:'reinicio', posicion_incierta:true}] };
};
let x = await call(T.eventoFisico, { params:{id:'8'}, body:{tipo:'reinicio'} });
assert.equal(x.err, null); assert.equal(x.r.body.estado,'pausado'); assert.equal(x.r.body.motivo_pausa,'reinicio');
assert.deepEqual(x.log.find(l=>/motivo_pausa = 'reinicio'/.test(l.sql)).params, ['8', true]);
assert(x.log.some(l=>l.sql==='COMMIT'));
// reinicio con telar ya pausado: sin cambios
globalThis.__q = (sql) => { if (/FOR UPDATE/.test(sql) && /FROM telares/.test(sql)) return { rows:[{id:8, estado:'pausado'}] }; if (/FROM historial_produccion h/.test(sql)) return {rows:[]}; };
x = await call(T.eventoFisico, { params:{id:'8'}, body:{tipo:'reinicio'} });
assert.equal(x.r.body.sin_cambios, true);

// 2) sin_senal
globalThis.__q = (sql) => {
  if (/FROM telares WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows:[{id:8, estado:'tejiendo'}] };
  if (/FROM historial_produccion h JOIN patrones/.test(sql)) return { rows:[] };
  if (/motivo_pausa = 'sin_senal'/.test(sql)) return { rows:[{id:8, estado:'pausado', motivo_pausa:'sin_senal'}] };
};
x = await call(T.eventoFisico, { params:{id:'8'}, body:{tipo:'sin_senal'} });
assert.equal(x.r.body.motivo_pausa,'sin_senal'); assert(x.log.some(l=>/INSERT INTO errores_log/.test(l.sql)));

// 3) retroceder desde la fila 0 -> última; retrocesos_contados +1
globalThis.__q = (sql) => {
  if (/FROM telares WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows:[{id:8, estado:'pausado'}] };
  if (/FROM historial_produccion h JOIN patrones/.test(sql)) return { rows:[{id:5, fila_actual:0, matriz_pasadas:MAT}] };
  if (/RETURNING id, estado, posicion_incierta/.test(sql)) return { rows:[{id:8}] };
};
x = await call(T.eventoFisico, { params:{id:'8'}, body:{tipo:'retroceder'} });
const upd = x.log.find(l=>/UPDATE historial_produccion/.test(l.sql));
assert.equal(upd.params[0], 3); assert.equal(upd.params[1], 1);
assert(x.log.some(l=>/retrocesos_contados = retrocesos_contados \+ CASE/.test(l.sql) && l.params[3]==='retroceder'));

// 4) tipo inválido
x = await call(T.eventoFisico, { params:{id:'8'}, body:{tipo:'volar'} }); assert.equal(x.err.status, 400);

// 5) asignarPatron mismo dibujo => reanuda
globalThis.__q = (sql) => {
  if (/FROM telares WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows:[{id:8, elementos_seleccion:4}] };
  if (/FROM patrones WHERE id/.test(sql)) return { rows:[{id:3, nombre:'Raya', columnas:4}] };
  if (/estado = 'en_curso' AND patron_id = \$2/.test(sql)) return { rows:[{id:9, patron_id:3, fila_actual:17}] };
};
x = await call(T.asignarPatron, { params:{id:'8'}, body:{patron_id:3} });
assert.equal(x.r.code, 200); assert.equal(x.r.body.reanudado, true); assert.equal(x.r.body.fila_actual, 17);
assert(!x.log.some(l=>/INSERT INTO historial_produccion/.test(l.sql)));
// con reiniciar:true => nueva producción
globalThis.__q = (sql) => {
  if (/FROM telares WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows:[{id:8, elementos_seleccion:4}] };
  if (/FROM patrones WHERE id/.test(sql)) return { rows:[{id:3, nombre:'Raya', columnas:4}] };
  if (/estado = 'en_curso' AND patron_id = \$2/.test(sql)) return { rows:[{id:9, patron_id:3, fila_actual:17}] };
  if (/INSERT INTO historial_produccion/.test(sql)) return { rows:[{id:10, fila_actual:0}] };
};
x = await call(T.asignarPatron, { params:{id:'8'}, body:{patron_id:3, reiniciar:true} });
assert.equal(x.r.code, 201); assert(x.log.some(l=>/SET fecha_fin = now\(\), estado = 'detenido_manual'/.test(l.sql)));
// otro dibujo sin producción abierta => 201
globalThis.__q = (sql) => {
  if (/FROM telares WHERE id = \$1 FOR UPDATE/.test(sql)) return { rows:[{id:8, elementos_seleccion:4}] };
  if (/FROM patrones WHERE id/.test(sql)) return { rows:[{id:4, nombre:'Cuadros', columnas:6}] };
  if (/INSERT INTO historial_produccion/.test(sql)) return { rows:[{id:11, fila_actual:0}] };
};
x = await call(T.asignarPatron, { params:{id:'8'}, body:{patron_id:4} });
assert.equal(x.r.code, 201); assert(/6 columnas/.test(x.r.body.advertencia));

// 6) avanzar: con sensor activo => 409 SENSOR_ACTIVO; sin sensor avanza y da vuelta
globalThis.__q = (sql) => { if (/AS sensor_activo\s+FROM telares/.test(sql)) return { rows:[{id:8, sensor_activo:true}] }; };
x = await call(T.avanzarTelar, { params:{id:'8'}, body:{} });
assert.equal(x.r.code, 409); assert.equal(x.r.body.codigo, 'SENSOR_ACTIVO'); assert(x.log.some(l=>l.sql==='ROLLBACK'));
globalThis.__q = (sql) => {
  if (/AS sensor_activo/.test(sql)) return { rows:[{id:8, sensor_activo:false}] };
  if (/FROM historial_produccion h JOIN patrones/.test(sql)) return { rows:[{id:5, fila_actual:3, matriz_pasadas:MAT}] };
  if (/UPDATE historial_produccion/.test(sql)) return { rows:[{id:5, fila_actual:0}] };
};
x = await call(T.avanzarTelar, { params:{id:'8'}, body:{} });
const u = x.log.find(l=>/UPDATE historial_produccion/.test(l.sql)); assert.deepEqual(u.params.slice(0,3), [0,1,1]); assert.equal(x.r.body.origen_conteo,'estimado');

// 7) retrocederTelar
globalThis.__q = (sql) => {
  if (/SELECT id FROM telares/.test(sql)) return { rows:[{id:8}] };
  if (/FROM historial_produccion h JOIN patrones/.test(sql)) return { rows:[{id:5, fila_actual:0, matriz_pasadas:MAT}] };
  if (/UPDATE historial_produccion/.test(sql)) return { rows:[{id:5, fila_actual:3}] };
};
x = await call(T.retrocederTelar, { params:{id:'8'}, body:{} });
assert.equal(x.r.body.al_inicio, true); assert.deepEqual(x.log.find(l=>/UPDATE historial_produccion/.test(l.sql)).params.slice(0,3),[3,1,1]);

// 8) actualizarPatron bloqueado con producción abierta
const body = { nombre:'Raya', filas:4, columnas:4, matriz_pasadas:[[1,0,1,0],[0,1,0,1],[1,1,0,0],[1,1,1,1]] };
globalThis.__q = (sql) => {
  if (/SELECT filas, columnas, matriz_pasadas FROM patrones/.test(sql)) return { rows:[{filas:4, columnas:4, matriz_pasadas:MAT}] };
  if (/JOIN historial_produccion h ON h.telar_id = t.id/.test(sql)) return { rows:[{codigo:'TELAR-01'}] };
};
x = await call(P.actualizarPatron, { params:{id:'3'}, body });
assert.equal(x.err?.status, 409); assert.equal(x.err.codigo, 'PATRON_EN_PRODUCCION');
// mismo contenido (solo renombrar) => pasa el bloqueo
globalThis.__q = (sql) => {
  if (/SELECT filas, columnas, matriz_pasadas FROM patrones/.test(sql)) return { rows:[{filas:4, columnas:4, matriz_pasadas:MAT}] };
  if (/UPDATE patrones/.test(sql)) return { rows:[{id:3}] };
};
x = await call(P.actualizarPatron, { params:{id:'3'}, body:{...body, nombre:'Raya 2', matriz_pasadas:MAT} });
assert.equal(x.err, null, x.err && x.err.message); assert(x.log.some(l=>/UPDATE patrones/.test(l.sql)));

// 9) estadísticas
const stat = (row, mpp) => { globalThis.__q = (sql) => {
  if (/FROM patrones WHERE id/.test(sql)) return { rows:[{id:3, nombre:'Raya', filas:4, columnas:4, metros_por_pasada:mpp}] };
  if (/FROM historial_produccion/.test(sql)) return { rows:[row] }; }; };
const base = { producciones:2, producciones_con_sensor:0, producciones_validadas:0, pasadas_estimadas:1000, pasadas_medidas:0, pasadas_validadas:0, pasadas_totales:1000, pasadas_mayor_produccion:600, repeticiones:250, primera_vez:null, ultima_vez:null, segundos_de_maquina:'7200' };
stat(base, '0.0005'); x = await call(P.estadisticasPatron, { params:{id:'3'} });
assert.equal(x.r.body.precision_conteo,'estimado'); assert.equal(x.r.body.metros_son_estimados,true); assert(x.r.body.aviso_precision);
stat({...base, producciones_con_sensor:2, producciones_validadas:2, pasadas_medidas:1000, pasadas_validadas:1000, pasadas_estimadas:0}, '0.0005'); x = await call(P.estadisticasPatron, { params:{id:'3'} });
assert.equal(x.r.body.precision_conteo,'sensor_validado'); assert.equal(x.r.body.metros_son_estimados,false); assert.equal(x.r.body.aviso_precision, undefined);
stat({...base, producciones_con_sensor:1}, null); x = await call(P.estadisticasPatron, { params:{id:'3'} });
assert.equal(x.r.body.precision_conteo,'mixto'); assert(x.r.body.aviso);

// 10) nivel2: reportarPasadas
const rp = (actual) => { globalThis.__q = (sql) => {
  if (/FROM historial_produccion h JOIN patrones p ON p.id = h.patron_id WHERE h.telar_id = \$1 AND h.estado = 'en_curso' ORDER BY/.test(sql)) return { rows:[actual] }; }; };
rp({id:5, pasadas_sensor:100, filas:4});
x = await call(N.reportarPasadas, { params:{id:'8'}, body:{pasadas_sensor:120, fila_actual:2} });
assert.equal(x.r.body.aplicado, true); const up = x.log.find(l=>/SET pasadas_sensor = \$1/.test(l.sql)); assert.deepEqual(up.params, [120,2,5,30]);
assert(x.log.some(l=>/ultimo_reporte_sensor = now\(\)/.test(l.sql)));
x = await call(N.reportarPasadas, { params:{id:'8'}, body:{pasadas_sensor:3, fila_actual:1} });   // reinicio del nodo: cae de 100 a 3
assert.equal(x.r.body.aplicado, false); assert.equal(x.r.body.pasadas_sensor, 100);
x = await call(N.reportarPasadas, { params:{id:'8'}, body:{pasadas_sensor:98, fila_actual:1} });    // retrocesos: cae 2
assert.equal(x.r.body.aplicado, true);
x = await call(N.reportarPasadas, { params:{id:'8'}, body:{pasadas_sensor:120, fila_actual:99} });  // fila fuera de rango => se ignora la fila
assert.equal(x.log.find(l=>/SET pasadas_sensor/.test(l.sql)).params[1], null);
x = await call(N.reportarPasadas, { params:{id:'8'}, body:{pasadas_sensor:-5} }); assert.equal(x.err.status, 400);

// 11) obtenerPatronActual
globalThis.__q = (sql) => ({ rows:[{id:3, nombre:'Raya', filas:4, columnas:4, matriz_pasadas:MAT, fila_actual:17, pasadas_sensor:900}] });
x = await call(N.obtenerPatronActual, { params:{id:'8'} }); assert.equal(x.r.body.fila_actual, 17); assert.equal(x.r.body.pasadas_sensor, 900); assert.equal(x.r.body.patron_id, 3);

// 12) validarConteo, retrocederFisico, pausar/reanudar
globalThis.__q = (sql) => /conteo_validado = true/.test(sql) ? { rows:[{id:5}] } : undefined;
x = await call(T.validarConteo, { params:{id:'8'}, body:{confirmo:true} }); assert.equal(x.r.body.id, 5);
x = await call(T.validarConteo, { params:{id:'8'}, body:{} }); assert.equal(x.err.status, 400);
globalThis.__q = (sql) => /retroceder_seq = retroceder_seq \+ 1,\s*retrocesos_contados = retrocesos_contados \+ 1/.test(sql) ? { rows:[{id:8, retroceder_seq:4, retrocesos_contados:9}] } : undefined;
x = await call(T.retrocederFisico, { params:{id:'8'} }); assert.equal(x.r.body.retrocesos_contados, 9);

// ─── Registro / sesión (auth.controller) con WebAuthn simulado ───
// Se crea un módulo falso de @simplewebauthn/server dentro de la carpeta temporal.
const nm = path.join(tmp, 'node_modules', '@simplewebauthn', 'server');
fs.mkdirSync(nm, { recursive: true });
fs.writeFileSync(path.join(nm, 'package.json'), '{"name":"@simplewebauthn/server","version":"0.0.0","type":"module","main":"index.js"}');
fs.writeFileSync(path.join(nm, 'index.js'), 'export const generateRegistrationOptions=async()=>({challenge:"c1"});export const verifyRegistrationResponse=async()=>({});export const generateAuthenticationOptions=async()=>({challenge:"c2"});export const verifyAuthenticationResponse=async()=>({});');
process.env.SESSION_SECRET = 'y'.repeat(40);
const dn = path.join(tmp, 'node_modules', 'dotenv'); fs.mkdirSync(dn, { recursive: true });
fs.writeFileSync(path.join(dn, 'package.json'), '{"name":"dotenv","version":"0.0.0","main":"index.js","exports":{"./config":"./config.js",".":"./index.js"}}');
fs.writeFileSync(path.join(dn, 'config.js'), ''); fs.writeFileSync(path.join(dn, 'index.js'), 'module.exports={config(){}}');
const A = await imp('src/controllers/auth.controller.js');
const AM = await imp('src/middleware/auth.js');
const hdr = {}; 
const resA = () => ({ code:200, body:null, status(c){this.code=c;return this}, json(b){this.body=b;return this}, append(k,v){hdr[k]=v;} });
async function callA(fn, req) { globalThis.__log=[]; const r=resA(); let err=null; const base = { params:{}, body:{}, query:{}, headers:{ host:'x.test', origin:'https://x.test' }, protocol:'https', ...req };
  base.get = (h) => ({ host: base.headers.host, origin: base.headers.origin })[String(h).toLowerCase()];
  await fn(base, r, (e)=>{err=e}); return { r, err, log: globalThis.__log }; }
const ahora = new Date();

// usuario existente, con huella, SIN sesión => 403 (antes cualquiera podía sumar su huella)
globalThis.__q = (sql) => {
  if (/FROM usuarios WHERE usuario = \$1/.test(sql)) return { rows:[{id:1, usuario:'mia', creado_at:new Date(Date.now()-86400000), webauthn_id:'AAAA'}] };
  if (/FROM credenciales_biometricas WHERE usuario_id/.test(sql)) return { rows:[{credential_id:'c'}] };
};
x = await callA(A.iniciarRegistro, { body:{usuario:'mia'} });
assert.equal(x.r.code, 403);
// mismo usuario CON sesión => avanza (opciones de registro)
const hs = {}; AM.emitirSesion({secure:true}, { append:(k,v)=>{hs.c=v;} }, {usuario:'mia', nombre:'Mia'});
x = await callA(A.iniciarRegistro, { body:{usuario:'mia'}, headers:{ host:'x.test', cookie: hs.c.split(';')[0] } });
assert.equal(x.r.code, 200); assert.equal(x.r.body.challenge, 'c1');
// cuenta recién creada y sin huella, sin sesión => se puede completar el registro
globalThis.__q = (sql) => {
  if (/FROM usuarios WHERE usuario = \$1/.test(sql)) return { rows:[{id:2, usuario:'nuevo', creado_at:ahora, webauthn_id:'BBBB'}] };
  if (/FROM credenciales_biometricas WHERE usuario_id/.test(sql)) return { rows:[] };
};
x = await callA(A.iniciarRegistro, { body:{usuario:'nuevo'} }); assert.equal(x.r.code, 200);
// usuario nuevo con el registro cerrado (3 usuarios) y sin invitación => 403
globalThis.__q = (sql) => {
  if (/FROM usuarios WHERE usuario = \$1/.test(sql)) return { rows:[] };
  if (/COUNT\(\*\)::int AS n FROM usuarios/.test(sql)) return { rows:[{n:3}] };
};
x = await callA(A.iniciarRegistro, { body:{usuario:'intruso'} });
assert.equal(x.r.code, 403); assert.equal(x.r.body.requiere_invitacion, true);
assert(!x.log.some(l=>/INSERT INTO usuarios/.test(l.sql)));
// con invitación válida => se crea el usuario y la invitación se CONSUME
globalThis.__q = (sql) => {
  if (/FROM usuarios WHERE usuario = \$1/.test(sql)) return { rows:[] };
  if (/COUNT\(\*\)::int AS n FROM usuarios/.test(sql)) return { rows:[{n:3}] };
  if (/FROM invitaciones WHERE codigo_hash/.test(sql)) return { rows:[{id:7}] };
  if (/INSERT INTO usuarios/.test(sql)) return { rows:[{id:9, usuario:'invitado', webauthn_id:'CCCC'}] };
  if (/FROM credenciales_biometricas WHERE usuario_id/.test(sql)) return { rows:[] };
};
x = await callA(A.iniciarRegistro, { body:{usuario:'invitado', invitacion:'TRAMA-XXXX'} });
assert.equal(x.r.code, 200);
const consumo = x.log.find(l=>/UPDATE invitaciones SET usada = true/.test(l.sql)); assert.deepEqual(consumo.params, [9, 7]);
// sesión
let rs = resA(); A.estadoSesion({ headers:{ cookie: hs.c.split(';')[0] } }, rs); assert.equal(rs.body.autenticado, true); assert.equal(rs.body.usuario, 'mia');
rs = resA(); A.estadoSesion({ headers:{} }, rs); assert.equal(rs.body.autenticado, false);
rs = resA(); A.logout({ headers:{}, secure:true }, rs); assert(/Max-Age=0/.test(hdr['Set-Cookie']));
// estado del registro
globalThis.__q = () => ({ rows:[{n:1}] }); x = await callA(A.estadoRegistro, {}); assert.equal(x.r.body.requiere_invitacion, false);
globalThis.__q = () => ({ rows:[{n:5}] }); x = await callA(A.estadoRegistro, {}); assert.equal(x.r.body.requiere_invitacion, true);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('controladores OK');

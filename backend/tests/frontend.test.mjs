import assert from 'assert'; import { boot } from './frontend.harness.mjs';
const MAT = [[1,0,1,0],[0,1,0,1],[1,1,0,0],[0,0,1,1]];
const patron = (id,n)=>({ id, nombre:n, filas:4, columnas:4, matriz_pasadas:MAT, colores_filas:[null,null,null,null], creado_at:'2026-09-01', modificado_at:'2026-09-01' });
let telar; const posts = [];
const routes = (m,u,b) => {
  if (m==='GET' && u==='/api/auth/estado-registro') return { requiere_invitacion:false };
  if (m==='GET' && u==='/api/patrones') return [patron(3,'Raya'), patron(4,'Cuadros')];
  if (m==='GET' && u==='/api/telares') return [{ id:8 }];
  if (m==='GET' && u.startsWith('/api/telares/8')) return telar;
  if (m==='POST') { posts.push(m+' '+u+' '+JSON.stringify(b)); return { id:8 }; }
  return {};
};

// ── T1: trabajo PAUSADO en la fila 2: al abrir la página se recupera
telar = { id:8, estado:'pausado', patron_actual_id:3, historial_actual_id:9, fila_actual:2, origen_conteo:'estimado', sensor_activo:false };
let f = boot(routes);
await f.run('iniciarApp()');
assert.equal(f.run('curRow'), 2, 'la fila se recupera del backend');
assert.equal(f.run('isPlaying'), false);
assert.equal(f.run('editId'), '3');
assert.equal(f.run('trabajoEnCursoPatronId'), '3');
assert.equal(f.run('nR'), 4);
// editar la matriz está bloqueado mientras el trabajo esté abierto
assert.equal(f.run('edicionBloqueada()'), true);

// ── T2: ▶ reanuda (no asigna de nuevo, no reinicia) y conserva la fila
posts.length = 0;
await f.run('startPlay()');
assert(posts.some(p=>p.includes('/api/telares/8/reanudar')), posts.join('|'));
assert(!posts.some(p=>p.includes('asignar-patron')), 'no debe reasignar: ' + posts.join('|'));
assert.equal(f.run('curRow'), 2); assert.equal(f.run('isPlaying'), true);
// el tick avanza la fila y avisa al backend
f.timers.length = 0; f.run('doTick()'); const tk = f.timers.pop(); tk.f();
assert.equal(f.run('curRow'), 3);
await Promise.resolve();
assert(f.calls.some(c=>c==='POST /api/telares/8/avanzar'));
f.run('isPlaying=false');

// ── T3: el editor tiene OTRO dibujo (4) y el telar tiene trabajo abierto del 3 → pregunta antes de cerrarlo
f = boot(routes);
await f.run('iniciarApp()');
f.run("loadDrawInEditor('4')");
assert.equal(f.run('editId'), '4');
posts.length = 0;
// showConfirm es una función real del script: se intercepta para simular que el operario cancela
f.run("globalThis.__confirmados=[]; showConfirm = function(t,m,yes,ly,no){ globalThis.__confirmados.push(t); if (no) no(); };");
await f.run('startPlay()');
assert.deepEqual(f.run('globalThis.__confirmados'), ['Hay un trabajo en curso']);
assert(!posts.some(p=>p.includes('asignar-patron')), 'cancelar no debe cerrar el trabajo abierto');
assert.equal(f.run('isPlaying'), false);
// si confirma, se asigna el nuevo y arranca en 0
f.run("showConfirm = function(t,m,yes){ yes(); };");
posts.length = 0;
await f.run('startPlay()');
assert(posts.some(p=>p.includes('asignar-patron') && p.includes('"patron_id":4')));
assert.equal(f.run('curRow'), 0); f.run('isPlaying=false');

// ── T4: trabajo que estaba EN MARCHA al cerrar la página: se sigue mostrando
telar = { id:8, estado:'tejiendo', patron_actual_id:3, historial_actual_id:9, fila_actual:5 % 4, origen_conteo:'sensor', sensor_activo:true };
f = boot(routes); await f.run('iniciarApp()');
assert.equal(f.run('isPlaying'), true); assert.equal(f.run('curRow'), 1); assert.equal(f.run('sensorManda'), true);
f.run('isPlaying=false');

// ── T5: sin trabajo abierto no se recupera nada y el editor no queda bloqueado
telar = { id:8, estado:'apagado', patron_actual_id:null, historial_actual_id:null, fila_actual:null };
f = boot(routes); await f.run('iniciarApp()');
assert.equal(f.run('trabajoEnCursoPatronId'), null); assert.equal(f.run('editId'), null);
assert.equal(f.run('edicionBloqueada()'), false);

// ── T6: 401 → vuelve al login
let sesion = true;
const r401 = (m,u,b) => (!sesion && u.startsWith('/api/patrones')) ? { status:401, body:{ error:'Tenés que iniciar sesión', codigo:'NO_AUTENTICADO' } } : routes(m,u,b);
telar = { id:8, estado:'pausado', patron_actual_id:3, historial_actual_id:9, fila_actual:1 };
f = boot(r401); await f.run('iniciarApp()'); sesion = false;
await f.run("apiFetch('/patrones').catch(()=>{})");
assert.equal(f.els['login-overlay'].style.display, 'flex');

// ── T7: terminar trabajo → detener y editor liberado
sesion = true; telar = { id:8, estado:'pausado', patron_actual_id:3, historial_actual_id:9, fila_actual:1 };
f = boot(routes); await f.run('iniciarApp()');
posts.length = 0;
f.run("showConfirm = function(t,m,yes){ yes(); };"); f.run('terminarTrabajo()');
await new Promise(r=>setImmediate(r)); await new Promise(r=>setImmediate(r));
assert(posts.some(p=>p.includes('/api/telares/8/detener')), posts.join('|'));
assert.equal(f.run('trabajoEnCursoPatronId'), null); assert.equal(f.run('edicionBloqueada()'), false); assert.equal(f.run('curRow'), -1);

// ── T8: con el sensor mandando, el backend rechaza /avanzar (409) y la pantalla deja de avanzar por reloj
const r409 = (m,u,b) => (m==='POST' && u.endsWith('/avanzar')) ? { status:409, body:{ error:'sensor', codigo:'SENSOR_ACTIVO' } } : routes(m,u,b);
telar = { id:8, estado:'pausado', patron_actual_id:3, historial_actual_id:9, fila_actual:0, sensor_activo:false };
f = boot(r409); await f.run('iniciarApp()'); await f.run('startPlay()');
f.timers.length = 0; f.run('doTick()'); f.timers.pop().f();
await new Promise(r=>setImmediate(r)); await new Promise(r=>setImmediate(r));
assert.equal(f.run('sensorManda'), true, 'tras el 409 la pantalla deja de avanzar por reloj');
const antes = f.run('curRow'); f.timers.length = 0; f.run('doTick()');
assert.equal(f.run('curRow'), antes, 'con el sensor mandando doTick no mueve la fila');
f.run('isPlaying=false');

// ── T9: retroceder desde la fila 0 vuelve a la última (el dibujo es un lazo), pausa y pide el pulso físico
const rRet = (m,u,b) => (m==='POST' && u.endsWith('/retroceder')) ? { id:1, fila_actual:3, al_inicio:true } : routes(m,u,b);
telar = { id:8, estado:'pausado', patron_actual_id:3, historial_actual_id:9, fila_actual:0 };
f = boot(rRet); await f.run('iniciarApp()'); posts.length = 0;
await f.run('ejecutarRetroceso()');
assert.equal(f.run('curRow'), 3); assert(f.calls.includes('POST /api/telares/8/retroceder-fisico'));

// ── T10: cerrar sesión avisa al servidor
f = boot(routes); await f.run('iniciarApp()');
f.run("showConfirm = function(t,m,yes){ yes(); };"); f.run('cerrarSesion()');
await new Promise(r=>setImmediate(r)); await new Promise(r=>setImmediate(r));
assert(f.calls.includes('POST /api/auth/logout'), f.calls.join('|'));

// ── T11: la ficha marca como ESTIMADOS los números que salen del reloj de la página, y no los marca cuando el conteo está validado
const conEst = (est) => (m,u,b) => u.endsWith('/estadisticas') ? est : routes(m,u,b);
const estBase = { patron:{id:3}, metros_por_pasada:0.0005, producciones:2, pasadas_totales:1000, repeticiones_del_dibujo:250, horas_de_maquina:2, primera_vez:'2026-09-01', ultima_vez:'2026-09-02', metros_tejidos:0.5, metros_mayor_produccion:0.3 };
telar = { id:8, estado:'pausado', patron_actual_id:3, historial_actual_id:9, fila_actual:0 };
f = boot(conEst({ ...estBase, precision_conteo:'estimado', metros_son_estimados:true, aviso_precision:'Estas pasadas se estiman' })); await f.run('iniciarApp()'); await f.run('fichaCargar()');
let h = f.els['ficha-est'].innerHTML;
assert(h.includes('(estimadas)') && h.includes('≈') && h.includes('(estimados)') && h.includes('Estas pasadas se estiman'), h);
f = boot(conEst({ ...estBase, precision_conteo:'sensor_validado', metros_son_estimados:false })); await f.run('iniciarApp()'); await f.run('fichaCargar()');
h = f.els['ficha-est'].innerHTML; assert(!h.includes('estimad') && !h.includes('≈'), h);

const settle = async () => { for (let i=0;i<6;i++) await new Promise(r=>setImmediate(r)); };
// ── T12: con el sensor sin validar aparece "Validar"; al confirmar se manda confirmo:true; validado no ofrece el botón
telar = { id:8, estado:'pausado', patron_actual_id:3, historial_actual_id:9, fila_actual:1, origen_conteo:'sensor', sensor_activo:true, ultimo_ping_esp32:null };
f = boot(routes); await f.run('iniciarApp()'); await settle(); await f.run('actualizarEstadoTelar()'); await settle();
assert.equal(f.els['telar-conteo'].style.display, ''); assert.equal(f.els['telar-conteo-btn'].style.display, '');
assert.equal(f.els['telar-conteo-txt'].textContent, 'Conteo del sensor sin validar');
posts.length = 0; f.run("showConfirm = function(t,m,yes){ yes(); };"); f.run('validarConteoTelar()');
await new Promise(r=>setImmediate(r)); await new Promise(r=>setImmediate(r));
assert(posts.some(p=>p.includes('/api/telares/8/validar-conteo') && p.includes('"confirmo":true')), posts.join('|'));
telar = { ...telar, origen_conteo:'sensor_validado' }; await settle(); await f.run('actualizarEstadoTelar()'); await settle();
assert.equal(f.els['telar-conteo-btn'].style.display, 'none'); assert.equal(f.els['telar-conteo-txt'].textContent, 'Conteo del sensor validado');
telar = { ...telar, origen_conteo:'estimado', sensor_activo:false }; await settle(); await f.run('actualizarEstadoTelar()'); await settle();
assert.equal(f.els['telar-conteo'].style.display, 'none');
console.log('frontend OK');

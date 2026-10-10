import assert from 'assert'; import { boot } from './frontend.harness.mjs';
const MAT = [[1,0,0,0],[0,1,0,0],[0,0,1,0],[0,0,0,1]];
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
// pero crear un dibujo NUEVO no toca ese trabajo: no se bloquea (antes avisaba "usá ⏹")
assert.equal(f.run('edicionBloqueada({ nuevo: true })'), false);
// con el tejido en marcha, sí: un dibujo nuevo frenaría la cuenta de esta pantalla
f.run('isPlaying=true'); assert.equal(f.run('edicionBloqueada({ nuevo: true })'), true); f.run('isPlaying=false');

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

// ── T13: crear un dibujo nuevo NO pausa el telar real (antes, con solo haber tocado una celda, sí)
telar = { id:8, estado:'tejiendo', patron_actual_id:null, historial_actual_id:null, fila_actual:null, origen_conteo:'estimado', sensor_activo:false };
const conPatronNuevo = (m,u,b) => (m==='POST' && u==='/api/patrones')
  ? (posts.push('POST /api/patrones'), { status:201, body: patron(5, b.nombre) }) : routes(m,u,b);
f = boot(conPatronNuevo); await f.run('iniciarApp()'); await settle();
f.run('repFilas[0] = 7'); f.run('tapCell(0,0)'); await settle();
posts.length = 0; f.run('resetEditorForNew()'); await settle();
assert(!posts.some(p=>p.includes('/pausar')), 'un dibujo nuevo no debe pausar el telar: ' + posts.join('|'));
assert.equal(f.run('repFilas.every(r => r === 1)'), true, 'el dibujo nuevo no hereda las repeticiones del anterior');
// el botón ⏸ sí pausa el telar, aunque esta pantalla no estuviera animando
posts.length = 0; await f.run('pausePlay(true)');
assert(posts.some(p=>p.includes('/api/telares/8/pausar')), posts.join('|'));

// ── T14: ⏪ pausa el TELAR antes de retroceder (antes solo frenaba la pantalla)
telar = { id:8, estado:'tejiendo', patron_actual_id:3, historial_actual_id:9, fila_actual:2, repeticion_en_fila:0, origen_conteo:'estimado', sensor_activo:false };
f = boot(routes); await f.run('iniciarApp()'); await settle();
posts.length = 0; await f.run('ejecutarRetroceso()'); await settle();
const iPausa = posts.findIndex(p=>p.includes('/pausar')), iRet = posts.findIndex(p=>p.includes('/retroceder ')), iFis = posts.findIndex(p=>p.includes('/retroceder-fisico'));
assert(iPausa >= 0 && iRet > iPausa && iFis > iRet, 'orden pausar → retroceder → retroceder-fisico: ' + posts.join('|'));

// ── T15: si otra pantalla lleva el tejido (409 OTRO_CONDUCTOR), esta la sigue y no suma pasadas
const conOtro = (m,u,b) => (m==='POST' && u==='/api/telares/8/avanzar')
  ? { status:409, body:{ error:'otra', codigo:'OTRO_CONDUCTOR' } } : routes(m,u,b);
telar = { id:8, estado:'pausado', patron_actual_id:3, historial_actual_id:9, fila_actual:1, repeticion_en_fila:0, origen_conteo:'estimado', sensor_activo:false };
f = boot(conOtro); await f.run('iniciarApp()'); await settle();
await f.run('startPlay()'); f.timers.length = 0; f.run('doTick()'); f.timers.pop().f(); await settle();
assert.equal(f.run('seguidor'), true, 'con otra pantalla conduciendo, esta queda como seguidora');
// como seguidora toma la posición del servidor en cada consulta
telar = { ...telar, estado:'tejiendo', fila_actual:3 }; await f.run('actualizarEstadoTelar()'); await settle();
assert.equal(f.run('curRow'), 3);
f.timers.length = 0; f.run('doTick()'); assert.equal(f.timers.pop().ms, 1000, 'la seguidora no avanza por reloj');

// ── T16: "ESP32 conectado" se decide con el reloj del servidor, no con el del celular
telar = { id:8, estado:'pausado', patron_actual_id:null, historial_actual_id:null, ultimo_ping_esp32:'2000-01-01T00:00:00Z', segundos_desde_ping:2, origen_conteo:'estimado' };
f = boot(routes); await f.run('iniciarApp()'); await settle(); await f.run('actualizarEstadoTelar()'); await settle();
assert.equal(f.els['telar-conexion-txt'].textContent, 'ESP32 conectado');

// ── T17: un trabajo con pasadas del sensor es del sensor aunque el nodo esté sin red: la pantalla
// no avanza por reloj (si lo hiciera, al volver el nodo sus reportes ya no coincidirían)
telar = { id:8, estado:'tejiendo', patron_actual_id:3, historial_actual_id:9, fila_actual:2, repeticion_en_fila:0, pasadas_sensor:120, origen_conteo:'sensor', sensor_activo:false };
f = boot(routes); await f.run('iniciarApp()'); await settle();
assert.equal(f.run('sensorManda'), true);
f.timers.length = 0; f.run('doTick()'); assert.equal(f.timers.pop().ms, 1000, 'sigue al sensor, no avanza por reloj');
await f.run('actualizarEstadoTelar()'); await settle(); assert.equal(f.run('sensorManda'), true);
f.run('isPlaying=false');

// ── T18: el telar se pausó por otra vía mientras esta pantalla llevaba el reloj (aunque no esté
// mirando el editor): el backend responde 409 TELAR_NO_TEJIENDO y la pantalla se frena en la
// posición del servidor, sin dejar errores en el registro
const pausadoAfuera = (m,u,b) => (m==='POST' && u==='/api/telares/8/avanzar')
  ? { status:409, body:{ error:'no', codigo:'TELAR_NO_TEJIENDO', estado:'pausado', motivo_pausa:null, fila_actual:3, repeticion_en_fila:0 } } : routes(m,u,b);
telar = { id:8, estado:'pausado', patron_actual_id:3, historial_actual_id:9, fila_actual:1, repeticion_en_fila:0, origen_conteo:'estimado', sensor_activo:false };
f = boot(pausadoAfuera); await f.run('iniciarApp()'); await settle();
await f.run('startPlay()'); f.run("goTo('sc-biblioteca')");
posts.length = 0; f.timers.length = 0; f.run('doTick()'); f.timers.pop().f(); await settle();
assert.equal(f.run('isPlaying'), false, 'se frena'); assert.equal(f.run('curRow'), 3, 'toma la fila del servidor');
assert(!posts.some(p=>p.includes('/api/errores')), 'no es un error: ' + posts.join('|'));

// ── T19: otra pantalla terminó el trabajo: 409 SIN_TRABAJO, se frena y queda sin trabajo
const terminadoAfuera = (m,u,b) => (m==='POST' && u==='/api/telares/8/avanzar')
  ? { status:409, body:{ error:'no', codigo:'SIN_TRABAJO' } } : routes(m,u,b);
f = boot(terminadoAfuera); await f.run('iniciarApp()'); await settle();
await f.run('startPlay()');
posts.length = 0; f.timers.length = 0; f.run('doTick()'); f.timers.pop().f(); await settle();
assert.equal(f.run('isPlaying'), false); assert.equal(f.run('trabajoEnCursoPatronId'), null);
assert(!posts.some(p=>p.includes('/api/errores')), posts.join('|'));

// ── T20: una consulta de estado que salió ANTES de tocar ▶ y vuelve después con "pausado" no
// frena la reproducción recién iniciada (antes la frenaba con la máquina ya tejiendo)
telar = { id:8, estado:'pausado', patron_actual_id:3, historial_actual_id:9, fila_actual:1, repeticion_en_fila:0, origen_conteo:'estimado', sensor_activo:false };
f = boot(routes); await f.run('iniciarApp()'); await settle();
const enVuelo = f.run('actualizarEstadoTelar()');          // sale con el telar todavía pausado
f.run('generacionPlay++; isPlaying = true;');               // mientras viaja, ▶ empezó a reproducir
await enVuelo; await settle();
assert.equal(f.run('isPlaying'), true, 'una respuesta vieja no frena la reproducción nueva');
// una consulta posterior que de verdad ve "pausado" sí la frena
await f.run('actualizarEstadoTelar()'); await settle();
assert.equal(f.run('isPlaying'), false);

// ── T21: entró como invitado con la base sin telares y después inicia sesión: el operario
// queda con el telar creado sin tener que recargar la página
const sinTelares = (m,u,b) => (m==='GET' && u==='/api/telares') ? [] : routes(m,u,b);
telar = { id:8, estado:'apagado', patron_actual_id:null, historial_actual_id:null, fila_actual:null };
f = boot(sinTelares); f.run('setUsuarioActual(null, null)'); await f.run('iniciarApp()'); await settle();
assert.equal(f.run('telarPorDefectoId'), null, 'el invitado no crea el telar');
posts.length = 0; f.run("setUsuarioActual('ana', 'Ana', 'huella')"); f.run('entrarAlSistema()'); await settle();
assert(posts.some(p=>p.startsWith('POST /api/telares ')), posts.join('|')); assert.equal(f.run('telarPorDefectoId'), 8);

// ── T22: "Cargar" el mismo dibujo que se está tejiendo no frena la reproducción de esta pantalla
telar = { id:8, estado:'pausado', patron_actual_id:3, historial_actual_id:9, fila_actual:2, repeticion_en_fila:0, origen_conteo:'estimado', sensor_activo:false };
f = boot(routes); await f.run('iniciarApp()'); await settle(); await f.run('startPlay()');
f.run("loadDrawInEditor('3')");
assert.equal(f.run('isPlaying'), true); assert.equal(f.run('curRow'), 2);

// ── T23: el telar se puso a tejer desde la botonera (u otra pantalla) con el mismo dibujo en el
// editor: esta pantalla se suma y cuenta desde la fila del servidor. Con otro dibujo, no.
telar = { id:8, estado:'pausado', patron_actual_id:3, historial_actual_id:9, fila_actual:2, repeticion_en_fila:0, origen_conteo:'estimado', sensor_activo:false };
f = boot(routes); await f.run('iniciarApp()'); await settle();
assert.equal(f.run('isPlaying'), false);
telar = { ...telar, estado:'tejiendo', fila_actual:3 };
await f.run('actualizarEstadoTelar()'); await settle();
assert.equal(f.run('isPlaying'), true, 'se suma al tejido'); assert.equal(f.run('seguidor'), true);
assert.equal(f.run('curRow'), 3, 'toma la fila del servidor');
f.run('isPlaying=false');
telar = { ...telar, estado:'pausado', fila_actual:2 };
f = boot(routes); await f.run('iniciarApp()'); await settle(); f.run("loadDrawInEditor('4')");
telar = { ...telar, estado:'tejiendo' };
await f.run('actualizarEstadoTelar()'); await settle();
assert.equal(f.run('isPlaying'), false, 'con otro dibujo en el editor no se suma');

// ── T24: una consulta de estado que salió antes de "Terminar trabajo" (telar todavía tejiendo)
// y vuelve después no suma la pantalla al trabajo recién terminado
telar = { id:8, estado:'tejiendo', patron_actual_id:3, historial_actual_id:9, fila_actual:1, repeticion_en_fila:0, origen_conteo:'estimado', sensor_activo:false };
f = boot(routes); await f.run('iniciarApp()'); await settle();
f.run('isPlaying=false; generacionPlay++;');
const vieja = f.run('actualizarEstadoTelar()');
f.run("showConfirm = function(t,m,yes){ yes(); };"); f.run('terminarTrabajo()');
await vieja; await settle();
assert.equal(f.run('isPlaying'), false, 'no se vuelve a sumar a un trabajo que se está terminando');

// ── T25: ver el código de recuperación desde el perfil y tocar "Listo" solo cierra la pantalla: no
// vuelve a entrar (antes recargaba y el editor saltaba al dibujo del trabajo en curso). Después de
// un registro, en cambio, sí se entra.
telar = { id:8, estado:'pausado', patron_actual_id:3, historial_actual_id:9, fila_actual:1, repeticion_en_fila:0, origen_conteo:'estimado', sensor_activo:false };
f = boot(routes); await f.run('iniciarApp()'); await settle(); f.run("loadDrawInEditor('4')");
const antesP = f.calls.filter(c=>c==='GET /api/patrones').length;
f.run("mostrarCodigoRecuperacion('TRAMA-ABC123', { desdePerfil: true })"); f.run('cerrarCodigoYEntrar()'); await settle();
assert.equal(f.run('editId'), '4', 'el editor sigue en el dibujo que se estaba editando');
assert.equal(f.calls.filter(c=>c==='GET /api/patrones').length, antesP, 'no se recargó nada');
f.run("mostrarCodigoRecuperacion('TRAMA-ABC123')"); f.run('cerrarCodigoYEntrar()'); await settle();
assert(f.calls.filter(c=>c==='GET /api/patrones').length > antesP, 'después de registrarse sí se entra');

// ── T26: un invitado no manda ⏸, ⏪ ni ⏹ al servidor (como ▶): se avisa en la pantalla
f = boot(routes); f.run('setUsuarioActual(null, null)'); await f.run('iniciarApp()'); await settle();
posts.length = 0; f.run("showConfirm = function(t,m,yes){ yes(); };");
await f.run('pausePlay(true)'); f.run('retrocederFisico()'); f.run('terminarTrabajo()'); await settle();
assert.equal(posts.length, 0, 'el invitado no comanda el telar: ' + posts.join('|'));

// ── ▶ con el telar sin responder (asignar-patron falla): la pantalla NO arranca "Tejiendo..."
{ const rFalla = (m,u,b) => (m==='POST' && u.includes('asignar-patron')) ? { status:500, body:{ error:'Error interno del servidor' } } : routes(m,u,b);
  telar = { id:8, estado:'apagado', patron_actual_id:null, historial_actual_id:null, fila_actual:null };
  f = boot(rFalla); await f.run('iniciarApp()');
  f.run("loadDrawInEditor('4')");
  await f.run('startPlay()');
  assert.equal(f.run('isPlaying'), false, 'sin el telar en marcha no se anima');
  // dos toques seguidos en ▶: un solo arranque
  telar = { id:8, estado:'apagado', patron_actual_id:null, historial_actual_id:null, fila_actual:null };
  f = boot(routes); await f.run('iniciarApp()'); f.run("loadDrawInEditor('4')");
  posts.length = 0;
  await Promise.all([f.run('startPlay()'), f.run('startPlay()')]);
  assert.equal(posts.filter(p=>p.includes('asignar-patron')).length, 1, posts.join('|'));
  f.run('isPlaying=false'); }

// ── el registro de errores no se inunda: el mismo error, como mucho una vez cada 30 s
{ f = boot(routes); f.run("origenSesion='huella'"); posts.length = 0;
  for (let i = 0; i < 20; i++) f.run("logError('Error al avanzar', 'falla', 'AVANZAR')");
  await settle();
  assert.equal(posts.filter(p=>p.includes('/api/errores')).length, 1, posts.join('|')); }

// ── editor: una sola bobina por fila, pasadas de cada fila e intercalar
{ f = boot(routes); await f.run('iniciarApp()'); f.run("newDraw()"); await settle();
  f.run('nR=3; nC=4; grid=[[0,0,0,0],[0,0,0,0],[0,0,0,0]]; repFilas=[1,1,1]; rowColors=[null,null,null]; editId=null; trabajoEnCursoPatronId=null; isPlaying=false');
  f.run('tapCell(0,1)'); f.run('tapCell(0,3)');
  assert.deepEqual(f.run('grid[0]'), [0,0,0,1], 'al marcar otra bobina de la fila, la anterior se apaga');
  f.run('tapCell(0,3)'); assert.deepEqual(f.run('grid[0]'), [0,0,0,0], 'tocarla de nuevo la desmarca');
  f.run('grid[1]=[1,1,0,0]'); assert.deepEqual(f.run('filasConVariasBobinas()'), [1]);
  // pasadas: un valor inválido conserva el anterior; uno válido se guarda sin redibujar la grilla
  f.run("setRepeticion(2, '25')"); assert.equal(f.run('repFilas[2]'), 25);
  f.run("setRepeticion(2, '1.000')"); assert.equal(f.run('repFilas[2]'), 25);
  f.run("setRepeticion(2, '99999')"); assert.equal(f.run('repFilas[2]'), 9999);
  // intercalar 1, 3, 2: reemplazar deja una vez la secuencia (el dibujo se repite solo)
  f.run("document.getElementById('int-orden').value='1, 3, 2'"); f.run("document.getElementById('int-pasadas').value='1'"); f.run("document.getElementById('int-veces').value='40'"); f.run("document.getElementById('int-donde').value='reemplazar'");
  f.run('aplicarIntercalar()');
  assert.equal(f.run('nR'), 3); assert.deepEqual(f.run('grid'), [[1,0,0,0],[0,0,1,0],[0,1,0,0]]);
  // al final, 40 veces: 120 filas más
  f.run("document.getElementById('int-donde').value='final'"); f.run('aplicarIntercalar()');
  assert.equal(f.run('nR'), 123); assert.deepEqual(f.run('grid[122]'), [0,1,0,0]);
  // sobre un dibujo sin ninguna bobina, "al final" no deja las filas vacías adelante
  f.run('nR=8; grid=Array.from({length:8},()=>[0,0,0,0]); repFilas=Array(8).fill(1); rowColors=Array(8).fill(null)');
  f.run("document.getElementById('int-veces').value='2'"); f.run('aplicarIntercalar()');
  assert.equal(f.run('nR'), 6); assert.deepEqual(f.run('grid[0]'), [1,0,0,0]);
  // fuera de rango: más de 300 filas o una bobina que no existe
  f.run("document.getElementById('int-veces').value='200'"); assert.match(f.run('leerIntercalar().error'), /300/);
  f.run("document.getElementById('int-orden').value='1, 9'"); assert.match(f.run('leerIntercalar().error'), /bobina 9/);
  // cantidades con punto de miles
  assert.equal(f.run("leerCantidad('1.000')"), 1000); assert.equal(f.run("leerCantidad('52,5')"), 52.5);
  assert.equal(f.run("leerCantidad('1.250,5')"), 1250.5); assert.equal(f.run("leerCantidad('52.5')"), 52.5); }

console.log('frontend OK');

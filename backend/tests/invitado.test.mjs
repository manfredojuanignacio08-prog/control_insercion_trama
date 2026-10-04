// Modo invitado: puede mirar y diseñar, no comandar el telar.
process.env.SESSION_SECRET='x'.repeat(40); process.env.ESP32_DEVICE_KEY='clave-esp32-de-prueba';
const m = await import('../src/middleware/auth.js');
import assert from 'assert';

function cookieDe(datos) {
  const h = {}; const res = { append:(k,v)=>{h[k]=v} };
  m.emitirSesion({secure:false}, res, datos);
  return h['Set-Cookie'].split(';')[0];
}
const invitado = cookieDe({usuario:'invitado', nombre:'Invitado', invitado:true});
const operario = cookieDe({usuario:'mia', nombre:'Mia'});

// la sesión de invitado se reconoce como tal; la de un operario no lleva la marca
assert.deepEqual(m.leerSesion({headers:{cookie:invitado}}), {usuario:'invitado', nombre:'Invitado', invitado:true});
assert.deepEqual(m.leerSesion({headers:{cookie:operario}}), {usuario:'mia', nombre:'Mia'});

// no se puede fabricar una sesión de operario quitándole la marca a una de invitado
const [cuerpo, firma] = decodeURIComponent(invitado.split('=')[1]).split('.');
const d = JSON.parse(Buffer.from(cuerpo,'base64url').toString()); delete d.i;
const forjado = Buffer.from(JSON.stringify(d)).toString('base64url') + '.' + firma;
assert.equal(m.leerSesion({headers:{cookie:'trama_sesion='+encodeURIComponent(forjado)}}), null);

const resp = () => ({ status(c){this.c=c;return this}, json(b){this.b=b;return this} });

// el invitado lee y diseña: pasa por requerirSesion
let paso=false; m.requerirSesion({headers:{cookie:invitado}}, resp(), ()=>{paso=true}); assert(paso);

// pero no comanda el telar: requerirOperario responde 403 con código propio
const r = resp(); paso=false;
m.requerirOperario({headers:{cookie:invitado}}, r, ()=>{paso=true});
assert(!paso && r.c===403 && r.b.codigo==='SOLO_OPERARIO');

// un operario sí comanda; sin sesión es 401 (no 403)
paso=false; m.requerirOperario({headers:{cookie:operario}}, resp(), ()=>{paso=true}); assert(paso);
const r2 = resp(); m.requerirOperario({headers:{}}, r2, ()=>{throw new Error('no debe pasar')}); assert.equal(r2.c, 401);

// el registro de errores: el invitado no escribe; el operario y el ESP32 sí
const r3 = resp(); paso=false;
m.requerirOperarioODispositivo({headers:{cookie:invitado}}, r3, ()=>{paso=true}); assert(!paso && r3.c===403);
paso=false; m.requerirOperarioODispositivo({headers:{'x-device-key':'clave-esp32-de-prueba'}}, resp(), ()=>{paso=true}); assert(paso);
paso=false; m.requerirOperarioODispositivo({headers:{cookie:operario}}, resp(), ()=>{paso=true}); assert(paso);

console.log('invitado OK');

process.env.SESSION_SECRET='x'.repeat(40); process.env.ESP32_DEVICE_KEY='clave-esp32-de-prueba';
const m = await import('../src/middleware/auth.js');
import assert from 'assert';
const headers = {}; const res = { append:(k,v)=>{headers[k]=v}, status(c){this.c=c;return this}, json(b){this.b=b;return this} };
m.emitirSesion({secure:true}, res, {usuario:'mia', nombre:'Mia'});
const ck = headers['Set-Cookie']; assert(ck.includes('HttpOnly') && ck.includes('Secure') && ck.includes('SameSite=Lax'));
const cookie = ck.split(';')[0];
assert.deepEqual(m.leerSesion({headers:{cookie}}), {usuario:'mia', nombre:'Mia'});
// cookie manipulada
const mala = cookie.replace(/=(.)/, '=X');
assert.equal(m.leerSesion({headers:{cookie:mala}}), null);
// firma inválida con cuerpo cambiado
const [c1,f1] = decodeURIComponent(cookie.split('=')[1]).split('.');
const forjado = Buffer.from(JSON.stringify({u:'admin',n:'admin',exp:Date.now()+1e9})).toString('base64url')+'.'+f1;
assert.equal(m.leerSesion({headers:{cookie:'trama_sesion='+encodeURIComponent(forjado)}}), null);
assert.equal(m.leerSesion({headers:{}}), null);
// dispositivo
assert(m.esDispositivoValido({headers:{'x-device-key':'clave-esp32-de-prueba'}}));
assert(!m.esDispositivoValido({headers:{'x-device-key':'otra'}}));
assert(!m.esDispositivoValido({headers:{}}));
// middleware
let nexted=false; const r2={status(c){this.c=c;return this},json(b){this.b=b}};
m.requerirSesionODispositivo({headers:{}}, r2, ()=>{nexted=true}); assert(!nexted && r2.c===401);
m.requerirSesionODispositivo({headers:{'x-device-key':'clave-esp32-de-prueba'}}, r2, ()=>{nexted=true}); assert(nexted);
const r3={status(c){this.c=c;return this},json(b){this.b=b}}; m.requerirDispositivo({headers:{cookie}}, r3, ()=>{throw new Error('no debe pasar')}); assert.equal(r3.c,401);
console.log('auth OK');

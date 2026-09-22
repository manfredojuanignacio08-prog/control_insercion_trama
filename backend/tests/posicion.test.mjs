import { avanzarPosicionTejido as av, retrocederPosicionTejido as re } from '../src/utils/posicion.js';
import assert from 'assert';
const M = [[1,0],[0,1],[1,1],[0,0]];
assert.deepEqual(av(0,M,1).fila_actual,1);
assert.deepEqual(av(3,M,1),{fila_actual:0,columna_actual:0,pasada_actual:0,vueltas_completadas:1});
assert.equal(av(1,M,9).fila_actual, 2); assert.equal(av(1,M,9).vueltas_completadas, 2);
// espejo: avanzar n y retroceder n vuelve al origen
for (let f=0; f<4; f++) for (let n=0;n<11;n++){ const a=av(f,M,n); const r=re(a.fila_actual,M,n); assert.equal(r.fila_actual,f,`f${f} n${n}`); assert.equal(r.vueltas_deshechas,a.vueltas_completadas - (0), `vueltas f${f} n${n}`) || 0; }
console.log('posicion OK');

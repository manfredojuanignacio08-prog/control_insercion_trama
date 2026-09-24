import { avanzarPosicionTejido as av, retrocederPosicionTejido as re } from '../src/utils/posicion.js';
import assert from 'assert';
const M = [[1,0],[0,1],[1,1],[0,0]];

// ── Sin repeticiones: una pasada es una fila, como siempre ──
assert.deepEqual(av(0,M,1).fila_actual,1);
assert.deepEqual(av(3,M,1),{fila_actual:0,columna_actual:0,pasada_actual:0,repeticion_en_fila:0,vueltas_completadas:1});
assert.equal(av(1,M,9).fila_actual, 2); assert.equal(av(1,M,9).vueltas_completadas, 2);

// espejo: avanzar n y retroceder n vuelve al origen
for (let f=0; f<4; f++) for (let n=0;n<11;n++){
  const a=av(f,M,n); const r=re(a.fila_actual,M,n);
  assert.equal(r.fila_actual,f,`f${f} n${n}`);
  assert.equal(r.vueltas_deshechas,a.vueltas_completadas,`vueltas f${f} n${n}`);
}

// ── Con repeticiones: la fila cambia recién al agotarlas ──
const R = [100,3,1,1];
assert.equal(av(0,M,1,R,0).fila_actual, 0);                    // la primera pasada no cambia de fila
assert.equal(av(0,M,1,R,0).repeticion_en_fila, 1);
assert.equal(av(0,M,99,R,0).fila_actual, 0);                   // a la 99 se sigue en la fila 1
assert.equal(av(0,M,100,R,0).fila_actual, 1);                  // a la 100 se pasa a la fila 2
assert.equal(av(0,M,100,R,0).repeticion_en_fila, 0);
assert.equal(av(0,M,103,R,0).fila_actual, 2);                  // 100 + 3 de la fila 2
const vuelta = av(0,M,105,R,0);                                 // 100+3+1+1 = una vuelta completa
assert.equal(vuelta.vueltas_completadas, 1);
assert.equal(vuelta.fila_actual, 0);
assert.equal(vuelta.repeticion_en_fila, 0);

// espejo con repeticiones, desde cualquier punto
for (let n=0;n<210;n+=7){
  const a=av(0,M,n,R,0);
  const r=re(a.fila_actual,M,n,R,a.repeticion_en_fila);
  assert.equal(r.fila_actual,0,`rep n${n}`);
  assert.equal(r.repeticion_en_fila,0,`rep dentro n${n}`);
  assert.equal(r.vueltas_deshechas,a.vueltas_completadas,`rep vueltas n${n}`);
}

// retroceder en el límite entre filas vuelve a la última pasada de la anterior
const lim = re(1,M,1,R,0);
assert.equal(lim.fila_actual, 0);
assert.equal(lim.repeticion_en_fila, 99);

// una posición guardada incoherente (más repeticiones de las que tiene la fila) se reencuadra
assert.equal(av(2,M,1,R,50).fila_actual, 3);

console.log('posicion OK');

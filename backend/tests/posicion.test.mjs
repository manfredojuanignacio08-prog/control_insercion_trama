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

// ── La versión aritmética coincide con avanzar/retroceder pasada por pasada ──
// Referencia: el algoritmo de antes, que movía la posición de a una pasada.
{
  const { avanzarPosicionTejido: av, retrocederPosicionTejido: rt } = await import('../src/utils/posicion.js');
  const reps1 = (reps, filas) => Array.from({ length: filas }, (_, i) => {
    const r = Array.isArray(reps) ? Number(reps[i]) : NaN;
    return Number.isInteger(r) && r >= 1 ? r : 1;
  });
  const paso = (filaAct, filas, pasos, reps, dentro0, atras) => {
    const R = reps1(reps, filas);
    let fila = ((Number(filaAct) || 0) % filas + filas) % filas;
    let dentro = Math.max(0, Math.trunc(Number(dentro0) || 0));
    if (dentro >= R[fila]) dentro = 0;
    let v = 0;
    for (let i = 0; i < Math.max(0, Math.trunc(pasos)); i++) {
      if (!atras) { dentro++; if (dentro >= R[fila]) { dentro = 0; fila++; if (fila >= filas) { fila = 0; v++; } } }
      else if (dentro > 0) dentro--;
      else { fila--; if (fila < 0) { fila = filas - 1; v++; } dentro = R[fila] - 1; }
    }
    return { fila, dentro, v };
  };
  let semilla = 12345;
  const azar = (n) => { semilla = (semilla * 1103515245 + 12345) % 2147483648; return semilla % n; };
  for (let t = 0; t < 20000; t++) {
    const filas = 1 + azar(7);
    const reps = azar(5) === 0 ? null : Array.from({ length: filas }, () => azar(10) === 0 ? 0 : 1 + azar(5));
    const fila = azar(20) - 5, dentro = azar(7) - 1, pasos = azar(60) - 3;
    const a = av(fila, filas, pasos, reps, dentro), ea = paso(fila, filas, pasos, reps, dentro, false);
    assert.deepEqual([a.fila_actual, a.repeticion_en_fila, a.vueltas_completadas], [ea.fila, ea.dentro, ea.v]);
    const r = rt(fila, filas, pasos, reps, dentro), er = paso(fila, filas, pasos, reps, dentro, true);
    assert.deepEqual([r.fila_actual, r.repeticion_en_fila, r.vueltas_deshechas], [er.fila, er.dentro, er.v]);
  }
  // Una cantidad enorme de pasos ya no bloquea el servidor: se resuelve con aritmética.
  const t0 = Date.now();
  const lejos = av(0, 300, 1e15, Array(300).fill(9999), 0);
  assert(Date.now() - t0 < 50);
  assert.equal(lejos.vueltas_completadas, Math.floor(1e15 / (300 * 9999)));
  console.log('posicion (aritmética = paso a paso) OK');
}

// Intercalados: el grupo avanza como una sola fila larga que empieza en su primera fila
{
  const { avanzarPosicionTejido: av, retrocederPosicionTejido: rt, largosDeFilas, filaDeIntercalado } = await import('../src/utils/posicion.js');
  const reps = [1, 1, 1, 1, 140, 1, 1];
  const g = [{ desde: 0, hasta: 3, pasadas: 120 }, { desde: 5, hasta: 6, pasadas: 140 }];
  assert.deepEqual(largosDeFilas(reps, 7, g), [120, 0, 0, 0, 140, 140, 0]);
  let p = av(0, 7, 119, reps, 0, g); assert.deepEqual([p.fila_actual, p.repeticion_en_fila], [0, 119]);
  p = av(0, 7, 120, reps, 0, g); assert.deepEqual([p.fila_actual, p.repeticion_en_fila], [4, 0]);
  p = av(0, 7, 400, reps, 0, g); assert.deepEqual([p.fila_actual, p.repeticion_en_fila, p.vueltas_completadas], [0, 0, 1]);
  p = rt(0, 7, 1, reps, 0, g); assert.deepEqual([p.fila_actual, p.repeticion_en_fila, p.vueltas_deshechas], [5, 139, 1]);
  // una posición guardada dentro del grupo (fila sin largo) se lleva a su primera fila
  p = av(2, 7, 0, reps, 5, g); assert.deepEqual([p.fila_actual, p.repeticion_en_fila], [0, 0]);
  // qué fila va en cada pasada: 1, 3, 4, 2, 1, 3...
  assert.deepEqual([0, 1, 2, 3, 4, 119].map((k) => filaDeIntercalado(g[0], reps, k)), [0, 1, 2, 3, 0, 3]);
  // con repeticiones dentro del grupo: fila 0 dos pasadas, fila 1 una
  assert.deepEqual([0, 1, 2, 3].map((k) => filaDeIntercalado({ desde: 0, hasta: 1, pasadas: 9 }, [2, 1], k)), [0, 0, 1, 0]);
  // ida y vuelta al azar: n adelante y n atrás vuelven al mismo lugar
  for (let t = 0; t < 2000; t++) {
    const n = 1 + Math.floor(Math.random() * 400);
    const ini = av(0, 7, Math.floor(Math.random() * 400), reps, 0, g);
    const ida = av(ini.fila_actual, 7, n, reps, ini.repeticion_en_fila, g);
    const vuelta = rt(ida.fila_actual, 7, n, reps, ida.repeticion_en_fila, g);
    assert.deepEqual([vuelta.fila_actual, vuelta.repeticion_en_fila], [ini.fila_actual, ini.repeticion_en_fila]);
  }
  console.log('posicion (intercalados) OK');
}

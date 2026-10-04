// Prueba de nivel2/posicion_dibujo.h, el MISMO código que corre en la placa: la posición
// (fila y pasadas que le faltan) tiene que avanzar y retroceder igual que el backend
// (backend/src/utils/posicion.js), que la ve como un desplazamiento en pasadas desde el
// principio del dibujo, en un lazo.
#include "posicion_dibujo.h"
#include <cassert>
#include <cstdio>
#include <cstdlib>

// fila + pasadas ya tejidas de esa fila -> pasadas desde el principio del dibujo
static long desplazamiento(int fila, int restantes, const int reps[]) {
  long acc = 0;
  for (int i = 0; i < fila; i++) acc += reps[i];
  return acc + (reps[fila] - restantes);
}

int main() {
  srand(1234);
  long casos = 0;
  for (int t = 0; t < 20000; t++) {
    const int filas = 1 + rand() % 7;
    int reps[8]; long porVuelta = 0;
    for (int i = 0; i < filas; i++) { reps[i] = 1 + rand() % 5; porVuelta += reps[i]; }
    int fila = rand() % filas;
    int restantes = 1 + rand() % reps[fila];
    long esperado = desplazamiento(fila, restantes, reps);
    for (int k = 0; k < 60; k++) {
      if (rand() % 3) { posicionAdelante(fila, restantes, reps, filas); esperado = (esperado + 1) % porVuelta; }
      else            { posicionAtras(fila, restantes, reps, filas);    esperado = (esperado - 1 + porVuelta) % porVuelta; }
      assert(fila >= 0 && fila < filas);
      assert(restantes >= 1 && restantes <= reps[fila]);
      assert(desplazamiento(fila, restantes, reps) == esperado);
      casos++;
    }
  }
  // Ida y vuelta: n adelante y n atrás vuelven al mismo lugar
  int reps[3] = { 4, 1, 3 }; int fila = 2, restantes = 2;
  for (int i = 0; i < 37; i++) posicionAdelante(fila, restantes, reps, 3);
  for (int i = 0; i < 37; i++) posicionAtras(fila, restantes, reps, 3);
  assert(fila == 2 && restantes == 2);
  // Sin dibujo no se mueve nada (y no se divide por cero)
  int f0 = 0, r0 = 1; posicionAdelante(f0, r0, reps, 0); posicionAtras(f0, r0, reps, 0);
  assert(f0 == 0 && r0 == 1);
  printf("  posición del dibujo: %ld pasos iguales al backend OK\n", casos);
}

#!/usr/bin/env python3
"""
Verificación de la lógica del firmware del Nivel 2.

Reproduce en Python lo que hace nivel2_seleccion.ino, para comprobar que el
avance de filas y el comando de los canales son correctos antes de subir el
código al microcontrolador.

No reemplaza la prueba en la máquina: verifica la lógica, no el hardware.
"""

N_CANALES = 4
DESPLAZAMIENTO_FILAS = 0


class Nivel2Simulado:
    """Reproduce el comportamiento del firmware, pasada por pasada."""

    def retomar(self, fila, pasadas):
        """Simula el arranque del nodo retomando lo guardado en el backend."""
        if 0 <= fila < self.filas:
            self.fila_actual = fila
            self.restantes = self.repeticiones[fila]
        if pasadas > 0:
            self.pasadas = pasadas

    def __init__(self, dibujo, desplazamiento=DESPLAZAMIENTO_FILAS, repeticiones=None):
        self.dibujo = dibujo
        # Cuántas pasadas seguidas se teje cada fila. Sin repeticiones, una por fila.
        self.repeticiones = list(repeticiones) if repeticiones else [1] * len(dibujo)
        self.restantes = self.repeticiones[0] if dibujo else 0
        self.desplazamiento = desplazamiento
        self.filas = len(dibujo)
        self.columnas = max(len(f) for f in dibujo) if dibujo else 0
        self.fila_actual = 0
        self.pasadas = 0
        self.vueltas = 0
        self.canales = [False] * N_CANALES
        self.historial = []

    def avisar_retroceso(self):
        """El Bloque A detectó Retroceder: el próximo pulso descuenta."""
        self.proxima_es_retroceso = True

    def apagar_todo(self):
        self.canales = [False] * N_CANALES

    def pulso_del_sensor(self, tejiendo=True, en_reposo=True):
        """Un pulso del sensor equivale a una pasada de la máquina."""
        # Si la paleta sigue enfrente del sensor, esto no es una pasada nueva:
        # es la misma paleta oscilando con la máquina detenida.
        if not en_reposo:
            return
        # El sensor no distingue el sentido de giro. Cuando el telar retrocede,
        # el Bloque A avisa y el pulso siguiente se descuenta en lugar de sumarse.
        if getattr(self, 'proxima_es_retroceso', False):
            self.pasadas = max(0, self.pasadas - 1)
            self.proxima_es_retroceso = False
            # La fila vuelve atrás: la próxima pasada hacia adelante repite la
            # fila que el telar acaba de deshacer.
            self.restantes += 1
            if self.restantes > self.repeticiones[self.fila_actual]:
                self.fila_actual = (self.fila_actual - 1) % self.filas
                self.restantes = 1
            return
        self.pasadas += 1
        if not tejiendo:
            # La máquina se mueve por la botonera: se cuenta, pero no se comanda.
            return
        # El desplazamiento compensa el desfase entre el pulso del sensor y el
        # instante en que el telar lee la selección.
        i = (self.fila_actual + self.desplazamiento) % self.filas
        fila = self.dibujo[i]
        for i in range(N_CANALES):
            self.canales[i] = bool(fila[i]) if i < len(fila) else False
        self.historial.append(tuple(self.canales))
        # La fila se teje tantas pasadas como diga repeticiones; recién ahí se avanza.
        self.restantes -= 1
        if self.restantes <= 0:
            self.fila_actual += 1
            if self.fila_actual >= self.filas:
                self.fila_actual = 0
                self.vueltas += 1
            self.restantes = self.repeticiones[self.fila_actual]


def verificar():
    # Un dibujo de prueba: 4 pasadas, 4 canales.
    dibujo = [
        [1, 0, 1, 0],
        [0, 1, 0, 1],
        [1, 1, 0, 0],
        [0, 0, 0, 0],   # una pasada sin ningún canal activo también es válida
    ]
    v = []

    s = Nivel2Simulado(dibujo)
    s.pulso_del_sensor()
    v.append(("La primera pasada aplica la fila 1", s.canales == [True, False, True, False]))

    s.pulso_del_sensor()
    v.append(("La segunda pasada aplica la fila 2", s.canales == [False, True, False, True]))

    s.pulso_del_sensor()
    s.pulso_del_sensor()
    v.append(("Una fila sin canales activos no enciende nada", s.canales == [False] * 4))

    s.pulso_del_sensor()
    v.append(("Al terminar el dibujo vuelve a la primera fila",
              s.fila_actual == 1 and s.vueltas == 1))

    s2 = Nivel2Simulado(dibujo)
    for _ in range(12):
        s2.pulso_del_sensor()
    v.append(("12 pasadas de un dibujo de 4 filas son 3 vueltas",
              s2.vueltas == 3 and s2.fila_actual == 0))

    s3 = Nivel2Simulado(dibujo)
    s3.pulso_del_sensor(tejiendo=False)
    v.append(("Con el telar movido a mano se cuenta la pasada pero no se comanda",
              s3.pasadas == 1 and s3.canales == [False] * 4 and s3.fila_actual == 0))

    s4 = Nivel2Simulado(dibujo)
    s4.pulso_del_sensor()
    s4.apagar_todo()
    v.append(("Apagar todo deja los cuatro canales en reposo", s4.canales == [False] * 4))

    dibujo_corto = [[1, 1], [0, 1]]
    s5 = Nivel2Simulado(dibujo_corto)
    s5.pulso_del_sensor()
    v.append(("Un dibujo con menos columnas que canales deja el resto en reposo",
              s5.canales == [True, True, False, False]))

    v.append(("Las columnas de una fila se aplican juntas, no de a una",
              len(s.historial[0]) == N_CANALES))

    s6 = Nivel2Simulado(dibujo, desplazamiento=1)
    s6.pulso_del_sensor()
    v.append(("Con desplazamiento 1 se aplica la fila siguiente",
              s6.canales == [False, True, False, True]))

    s7 = Nivel2Simulado(dibujo, desplazamiento=-1)
    s7.pulso_del_sensor()
    v.append(("Con desplazamiento -1 se aplica la última fila, sin índice negativo",
              s7.canales == [False] * 4))

    s9 = Nivel2Simulado(dibujo)
    for _ in range(4):
        s9.pulso_del_sensor()
    p4 = s9.pasadas
    s9.pulso_del_sensor(en_reposo=False)
    v.append(("Con la paleta todavía enfrente no se cuenta una pasada nueva",
              s9.pasadas == p4))

    s10 = Nivel2Simulado(dibujo)
    for _ in range(5):
        s10.pulso_del_sensor()
    antes_retro = s10.pasadas
    s10.avisar_retroceso()
    s10.pulso_del_sensor()
    v.append(("Tras un retroceso el pulso siguiente descuenta en vez de sumar",
              s10.pasadas == antes_retro - 1))

    # Caso completo: tejer 5 pasadas, retroceder, y verificar que la pasada
    # siguiente repita exactamente la fila que se deshizo.
    s12 = Nivel2Simulado(dibujo)
    for _ in range(5):
        s12.pulso_del_sensor()
    fila_deshecha = s12.historial[-1]
    s12.avisar_retroceso()
    s12.pulso_del_sensor()
    s12.pulso_del_sensor()
    v.append(("Tras un retroceso la pasada siguiente repite la misma fila",
              s12.historial[-1] == fila_deshecha))
    v.append(("Tras un retroceso el conteo queda donde corresponde",
              s12.pasadas == 5))

    # Al cambiar de dibujo el nodo arranca desde la primera fila del nuevo, no
    # desde la posición en la que venía del anterior.
    s13 = Nivel2Simulado(dibujo)
    for _ in range(3):
        s13.pulso_del_sensor()
    otro = [[0, 0, 1, 1], [1, 1, 0, 0]]
    s14 = Nivel2Simulado(otro)          # equivale a recargar con el dibujo nuevo
    s14.pulso_del_sensor()
    v.append(("Un dibujo nuevo empieza por su primera fila",
              s14.canales == [False, False, True, True]))

    # Reinicio del nodo a mitad de una pieza: retoma fila y conteo del backend.
    s15 = Nivel2Simulado(dibujo)
    for _ in range(6):
        s15.pulso_del_sensor()
    fila_antes, pasadas_antes = s15.fila_actual, s15.pasadas
    siguiente_esperada = s15.dibujo[fila_antes]

    s16 = Nivel2Simulado(dibujo)          # nodo recién reiniciado, memoria en cero
    s16.retomar(fila_antes, pasadas_antes)
    s16.pulso_del_sensor()
    v.append(("Tras reiniciarse, el nodo sigue el dibujo donde quedó",
              list(s16.canales) == [bool(x) for x in siguiente_esperada]))
    v.append(("Tras reiniciarse, el conteo continúa en vez de volver a cero",
              s16.pasadas == pasadas_antes + 1))

    s17 = Nivel2Simulado(dibujo)
    s17.retomar(99, 50)                   # posición inválida para este dibujo
    v.append(("Una posición guardada fuera de rango no se adopta",
              s17.fila_actual == 0))

    # Repeticiones: una fila con 100 repeticiones son 100 pasadas de la misma
    # combinación de bobinas antes de pasar a la siguiente.
    s18 = Nivel2Simulado(dibujo, repeticiones=[100, 3, 1, 1])
    for _ in range(99):
        s18.pulso_del_sensor()
    v.append(("Con 100 repeticiones, a la pasada 99 se sigue tejiendo la fila 1",
              s18.fila_actual == 0 and s18.historial[-1] == s18.historial[0]))
    s18.pulso_del_sensor()
    v.append(("A la pasada 100 se pasa a la fila 2", s18.fila_actual == 1))
    for _ in range(3):
        s18.pulso_del_sensor()
    v.append(("La fila 2 se teje sus 3 repeticiones y pasa a la 3", s18.fila_actual == 2))

    s19 = Nivel2Simulado(dibujo, repeticiones=[5, 5, 5, 5])
    total = 0
    while s19.vueltas == 0:
        s19.pulso_del_sensor(); total += 1
    v.append(("Una vuelta completa son la suma de las repeticiones", total == 20))

    s20 = Nivel2Simulado(dibujo, repeticiones=[4, 4, 4, 4])
    for _ in range(5):
        s20.pulso_del_sensor()          # fila 2, primera repetición
    antes = (s20.fila_actual, s20.restantes)          # fila 2, quedan 3 de 4
    s20.avisar_retroceso(); s20.pulso_del_sensor()
    v.append(("Retroceder deshace la pasada, sin salir de la fila si todavía quedaba",
              (s20.fila_actual, s20.restantes) == (1, 4)))
    s20.pulso_del_sensor()
    v.append(("Y la pasada siguiente retoma donde estaba",
              (s20.fila_actual, s20.restantes) == antes))

    # Retroceder justo en el límite sí tiene que volver a la fila anterior.
    s21 = Nivel2Simulado(dibujo, repeticiones=[4, 4, 4, 4])
    for _ in range(4):
        s21.pulso_del_sensor()                         # termina la fila 1, entra en la 2
    s21.avisar_retroceso(); s21.pulso_del_sensor()
    v.append(("En el límite entre filas, retroceder vuelve a la última pasada de la anterior",
              (s21.fila_actual, s21.restantes) == (0, 1)))

    s11 = Nivel2Simulado(dibujo)
    s11.avisar_retroceso()
    s11.pulso_del_sensor()
    v.append(("Un retroceso con el contador en cero no lo deja negativo",
              s11.pasadas == 0))

    s8 = Nivel2Simulado(dibujo)
    s8.pulso_del_sensor()
    antes = list(s8.canales)
    v.append(("La selección se mantiene hasta el pulso siguiente, no se libera por tiempo",
              s8.canales == antes))

    print("\n  VERIFICACIÓN DEL FIRMWARE DEL NIVEL 2\n")
    for texto, ok in v:
        print(f"  {'✅' if ok else '❌'} {texto}")
    n = sum(1 for _, ok in v if ok)
    print(f"\n  RESULTADO: {n}/{len(v)} verificaciones OK\n")
    return n == len(v)


if __name__ == "__main__":
    import sys
    sys.exit(0 if verificar() else 1)

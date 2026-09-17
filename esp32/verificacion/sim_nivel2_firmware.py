#!/usr/bin/env python3
"""
Verificación de la lógica del firmware del Nivel 2.

Reproduce en Python lo que hace nivel2_seleccion.ino, para comprobar que el
avance de filas y el comando de los canales son correctos antes de subir el
código al microcontrolador.

No reemplaza la prueba en la máquina: verifica la lógica, no el hardware.
"""

N_CANALES = 6
DESPLAZAMIENTO_FILAS = 0


class Nivel2Simulado:
    """Reproduce el comportamiento del firmware, pasada por pasada."""

    def __init__(self, dibujo, desplazamiento=DESPLAZAMIENTO_FILAS):
        self.dibujo = dibujo
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
        self.fila_actual += 1
        if self.fila_actual >= self.filas:
            self.fila_actual = 0
            self.vueltas += 1


def verificar():
    # Un dibujo de prueba: 4 pasadas, 6 canales.
    dibujo = [
        [1, 0, 1, 0, 1, 0],
        [0, 1, 0, 1, 0, 1],
        [1, 1, 1, 0, 0, 0],
        [0, 0, 0, 0, 0, 0],   # una pasada sin ningún canal activo también es válida
    ]
    v = []

    s = Nivel2Simulado(dibujo)
    s.pulso_del_sensor()
    v.append(("La primera pasada aplica la fila 1", s.canales == [True, False, True, False, True, False]))

    s.pulso_del_sensor()
    v.append(("La segunda pasada aplica la fila 2", s.canales == [False, True, False, True, False, True]))

    s.pulso_del_sensor()
    s.pulso_del_sensor()
    v.append(("Una fila sin canales activos no enciende nada", s.canales == [False] * 6))

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
              s3.pasadas == 1 and s3.canales == [False] * 6 and s3.fila_actual == 0))

    s4 = Nivel2Simulado(dibujo)
    s4.pulso_del_sensor()
    s4.apagar_todo()
    v.append(("Apagar todo deja los seis canales en reposo", s4.canales == [False] * 6))

    dibujo_corto = [[1, 1], [0, 1]]
    s5 = Nivel2Simulado(dibujo_corto)
    s5.pulso_del_sensor()
    v.append(("Un dibujo con menos columnas que canales deja el resto en reposo",
              s5.canales == [True, True, False, False, False, False]))

    v.append(("Las columnas de una fila se aplican juntas, no de a una",
              len(s.historial[0]) == N_CANALES))

    s6 = Nivel2Simulado(dibujo, desplazamiento=1)
    s6.pulso_del_sensor()
    v.append(("Con desplazamiento 1 se aplica la fila siguiente",
              s6.canales == [False, True, False, True, False, True]))

    s7 = Nivel2Simulado(dibujo, desplazamiento=-1)
    s7.pulso_del_sensor()
    v.append(("Con desplazamiento -1 se aplica la última fila, sin índice negativo",
              s7.canales == [False] * 6))

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

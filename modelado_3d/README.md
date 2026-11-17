# Modelo 3D del gabinete

El gabinete del Control de Inserción de Trama en 3D, hecho con Three.js. Muestra la caja estanca
IP65 de 300 × 230 × 106 mm con las siete plaquetas, los módulos de relés, la bornera y el cableado.

| Archivo | Para qué |
|---|---|
| `index.html` | La versión completa, para la computadora. |
| `celular.html` | La misma, más liviana, para el celular. |

Se abren directamente en el navegador (doble clic). Se puede girar con el mouse o el dedo,
acercar, abrir la tapa, ver cada plaqueta por separado y tocar un componente para leer qué es y
cómo se conecta. No necesita internet: todo lo que usa va dentro del mismo archivo.

La vista se acomoda sola a la pantalla: la caja queda centrada y llena el cuadro en un monitor, en un
celular parado o acostado, y se vuelve a encuadrar al girar el celular. En el celular, mientras se
gira se dibuja una pasada rápida y, al soltar, la imagen se pule (bordes suaves y sombras con
penumbra). Los LED encendidos del ESP32 y de los módulos de relé derraman su luz sobre la plaqueta.

Para que ande liviano, también en un celular modesto:

- **Con la tapa puesta no se dibuja lo de adentro.** Dos de cada tres triángulos del modelo están
  dentro de la caja; se dibujan recién al abrirla. Mientras tanto, sus texturas se van preparando de
  fondo, para que la tapa abra sin tirones.
- **Cada pieza lleva los lados que pide su tamaño.** Un tornillo de 5 mm o una resistencia no
  necesitan miles de triángulos: el modelo completo pasó de 325.000 a 233.000 (en el celular,
  de 302.000 a 179.000) sin que cambie la imagen.
- **Quieto, no gasta.** Con la imagen terminada deja de redibujar hasta que alguien lo toca.
- **Avisa mientras carga.** Aparece «Armando el modelo 3D…» en vez del cuadro vacío.

## El lado del cobre de cada plaqueta

En «Ver plaqueta por plaqueta» cada plaqueta se puede dar vuelta para ver las pistas. Las pistas
siguen el circuito de los planos; el recorrido es propio del modelo (no es una copia del diseño en
Proteus), con estas reglas:

- **Sin plano de masa**, como en los diseños en Proteus: la masa va por pista, más ancha que las
  señales (1,27 mm contra 1 mm), y entre cobre de redes distintas queda al menos 0,4 mm.
- **Cada conector con el orden de patas de los planos** (`diagramas/hardware/caja_y_plaquetas/`):
  J4 de la principal y del sensado (1 GPIO32, 2 GPIO33, 3 GPIO34, 4 3V3, 5 GND), J8 de la principal
  y J1 del Nivel 2 (1 GPIO35, 2 GPIO18, 3 GPIO19, 4 GPIO21, 5 GPIO22, 6 GND, 7 3V3), J1 de la de relés
  y J3 del relé de Retroceder (1 −, 2 S, 3 +). El pad cuadrado marca la pata 1.
- **Los puentes de alambre de los planos**: A (GPIO 34) y B (GPIO 35) en la principal y C (masa) en
  la del Nivel 2, con su letra al lado. En la de relés y en la del sensado, el recorrido del modelo
  usa además uno y dos puentes cortos.
- **El lado del telar separado del lado del ESP32**: no pasa cobre por debajo de los PC817 ni de
  los LCA110.
- Al lado de cada pista principal, su nombre (GPIO, 3,3 V, 5 V, GND), como una serigrafía.

Cada plaqueta se verificó con un chequeo automático: distancias entre cobre de redes distintas,
continuidad de cada red (pistas más puentes) y nada fuera del borde ni sobre los agujeros de
montaje.

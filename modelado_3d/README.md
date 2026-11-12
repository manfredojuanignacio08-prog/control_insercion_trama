# Modelo 3D del gabinete

El gabinete del Control de Inserción de Trama en 3D, hecho con Three.js. Muestra la caja estanca
IP65 de 300 × 230 × 106 mm con las siete plaquetas, los módulos de relés, la bornera y el cableado.

| Archivo | Para qué |
|---|---|
| `index.html` | La versión completa, para la computadora. |
| `celular.html` | La misma, más liviana, para el celular. |

Se abren directamente en el navegador (doble clic). Se puede girar con el mouse o el dedo,
acercar, abrir la tapa, ver cada plaqueta por separado y tocar un componente para leer qué es y
cómo se conecta. Necesita internet para cargar React y las tipografías.

La vista se acomoda sola a la pantalla: la caja queda centrada y llena el cuadro en un monitor, en un
celular parado o acostado, y se vuelve a encuadrar al girar el celular. En el celular, mientras se
gira se dibuja una pasada rápida y, al soltar, la imagen se pule (bordes suaves y sombras con
penumbra). Los LED encendidos del ESP32 y de los módulos de relé derraman su luz sobre la plaqueta.


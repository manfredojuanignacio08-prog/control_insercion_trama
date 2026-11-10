# Diseño de las plaquetas en Proteus

Los proyectos de Proteus Design Suite 8 (esquemático y PCB) de las cinco plaquetas impresas del gabinete. Son
las versiones más nuevas, las que corresponden a los dibujos de cada plaqueta en la carpeta de arriba. El PCB
se ve en la pestaña PCB Layout.

| Archivo | Plaqueta | Dibujo | Última modificación |
|---|---|---|---|
| `plaqueta_2_parte_1_info_B_corregido.pdsprj` | Principal (100 × 95 mm) | `plaqueta_principal.png` | 31/10/2026 |
| `placa_2_parte_2_info_B.pdsprj` | Relés (40 × 30 mm) | `plaqueta_reles.png` | 18/10/2026 |
| `proyecto_de_INFO_B.pdsprj` | Sensado de la botonera (105 × 100 mm) | `plaqueta_sensado.png` | 31/10/2026 |
| `extra_placat_puentes.pdsprj` | Puentes rectificadores, 3 × DB157 (80 × 50 mm) | `plaqueta_puentes.png` | 31/10/2026 |
| `plaqueta_3_info_B_corregido.pdsprj` | Nivel 2 (100 × 75 mm) | `plaqueta_nivel2.png` | 22/10/2026 |

Antes de imprimirlas:

- A la principal le faltan dos pistas y a la del Nivel 2, una: van los puentes de cable aislado A, B y C que
  marcan sus dibujos (Guía de conexión y puesta en marcha, punto 4.6).
- En la principal, la tira derecha del ESP32 quedó con los pines en otro orden: el ESP32 va en su propia
  plaqueta (`../../plaqueta_esp32/`, con el DXF para importar en ARES), cableada a J5, J6 y J7. J3 no se monta.
- La fuente no tiene diseño propio: es el módulo HLK-5M05 con su fusible y dos borneras (Guía, punto 4.1).
- La plaqueta impresa no lleva serigrafía: hay que marcar a mano el + de cada capacitor y la pata 1 de cada
  PC817, de cada puente rectificador y de cada zócalo.

Son parte de los planos que se entregan con la venta con planos (Manual del telar en fábrica, sección 3.4).

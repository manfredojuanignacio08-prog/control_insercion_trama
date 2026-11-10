# Precio con recuperación a dos años

Este es el cálculo del precio final de la presentación: **$290.000 por telar más un abono de $20.000 por mes por telar**. Aparece en:

- la Estimación de Costos (sección 4.1);
- la Modalidad de Inversión;
- la Documentación de Proyecto (sección 8 y su sitio);
- el diagrama `diagramas/sistema/estimacion.svg`.

Reemplaza al precio anterior de $3.200.000 por telar (19 telares en dos años). Ese precio era demasiado alto para una fábrica, contaba 28 h de instalación por telar y no contaba el abono.

El 03/11/2026 se recalculó con las horas y las tarifas nuevas de cada rol del Gantt (Desarrollo USD 13, Infraestructura de Red USD 10 y Administración de BD USD 11). Además se sacaron algunos roles de las tareas donde no hacían falta, y el armado y el conexionado del hardware quedaron a cargo de los especialistas en MCU y de los desarrolladores. Cada tarea queda con quien la lleva adelante y, cuando el trabajo es en conjunto, con un segundo rol (las horas de las tareas no cambian). Con eso el precio baja de $600.000 a $290.000 por telar; el abono no cambia.

El 04/11/2026 se completaron en el Gantt las tareas de la Etapa 08: con las 642 horas de las ocho etapas completas, el equipo suma 915 horas-persona. La inversión sube a $17.936.812 y hacen falta unos 86 telares en dos años; el precio y el abono no cambian.

## Inversión a recuperar: $17.936.812

| Concepto | Monto |
|---|---|
| Horas del equipo: 915 horas-persona (sobre las 642 h del Gantt, todas completas), con las horas y la tarifa de cada rol del Gantt (tabla de personal de la Estimación v4) | $17.705.023 |
| Componentes del telar piloto | $154.739 |
| Insumos materiales ($15.000 + 7 %) | $16.050 |
| Claude Pro (USD 40 × $1.525) | $61.000 |

Las horas y tarifas por rol son estas. Cada tarifa se pasa a pesos a $1.525 por dólar y lleva 5 % de contingencia:

| Rol | Horas | USD/h | Subtotal |
|---|---|---|---|
| PM | 154 | 14 | $3.452.295 |
| D01 | 88 | 13 | $1.831.830 |
| D02 | 155 | 13 | $3.226.519 |
| IM01 | 145 | 12 | $2.786.175 |
| IM02 | 127 | 12 | $2.440.305 |
| IR | 46 | 10 | $736.575 |
| BD | 18 | 11 | $317.048 |
| DUX | 135 | 10 | $2.161.688 |
| MUL | 47 | 10 | $752.588 |

De ese total, el dinero que el equipo puso de verdad es **$231.789**. Son los componentes, los insumos y Claude Pro. El resto es el valor de las horas de trabajo.

## Lo que cuesta cada telar nuevo: $286.079

- **Componentes: $154.739.** Se vuelven a comprar en cada telar. Desde el 02/11 incluyen la plaqueta de los puentes rectificadores y sus tiras de 4 pines ($3.900).
- **Insumos de armado: $16.050.**
- **Mano de obra: 6 h × $18.300 (tarifa de Infraestructura de MCU, USD 12) × 1,05 = $115.290.** Se reparte así:
  - 3 h de armado del gabinete en el taller, con las plaquetas ya diseñadas;
  - 2 h de instalación y prueba en el telar;
  - 1 h de capacitación.

Las 28 h del cálculo anterior eran las del telar piloto: incluían medir la máquina y ajustar el diseño, y eso no se repite. El software no se vuelve a pagar en cada cliente.

**Ganancia por telar: $290.000 − $286.079 = $3.921.**

## El abono: $20.000 por mes por telar

El abono suma unos USD 13 por telar. Una fábrica de 10 telares paga $200.000 por mes. Con él se pagan los costos fijos del servicio, que son los mismos para todos los clientes: **$89.975 por mes** desde el primer cliente.

- 4 h de desarrollo por mes, para el mantenimiento del código: 4 h × $19.825 (USD 13) = $79.300.
- El servidor y el dominio: unos USD 7 por mes, $10.675. Hoy no cuestan nada porque los datos son pocos.

Lo que sobra del abono va a la recuperación.

## Cuántos telares hacen falta en dos años

Los telares se venden a ritmo parejo, y cada uno paga el abono desde el mes siguiente a su instalación.

| Precio por telar | Ganancia por telar | Telares para recuperar en 2 años |
|---|---|---|
| $280.000 | −$6.079 (pierde) | 90 |
| **$290.000** | **$3.921** | **86 (≈ 9 fábricas de 10 telares)** |
| $320.000 | $33.921 | 77 |
| $290.000, con abono de $25.000 | $3.921 | 69 |

Con unos 21 o 22 telares por semestre a $290.000 (86 en total), el saldo acumulado queda así:

| Momento | Saldo |
|---|---|
| Inicio | −$17,9 M |
| Semestre 1 | −$17,3 M |
| Semestre 2 | −$14,1 M |
| Semestre 3 | −$8,3 M |
| Semestre 4 | +$0,02 M |

## Otra forma de venta: con los planos del hardware

En vez de fabricar el gabinete, el equipo puede vender el software, el mantenimiento y los planos, y la fábrica arma, instala y prueba el gabinete con su propio técnico. Los planos son los dibujos de las siete plaquetas y del armado de la caja, la lista de componentes, los componentes en placa, las conexiones pata por pata, las guías de armado y de conexión, el checklist de verificaciones y la guía de mediciones.

| | Paquete (el equipo fabrica e instala) | Con los planos (la fábrica arma) |
|---|---|---|
| Lo que cobra el equipo por telar | $290.000 | $3.921 (el software y los planos) |
| Abono | $20.000 por mes por telar | $20.000 por mes por telar |
| Lo que gana el equipo por telar | $3.921 | $3.921 |
| Componentes ($154.739) e insumos ($16.050) | Los compra el equipo (están en el precio) | Los compra la fábrica |
| Armado, instalación y prueba (3 h y 2 h por telar en el cálculo) | El equipo | El técnico de la fábrica |
| Gasto inicial de la fábrica | $290.000 | $174.710, más las horas de su técnico |
| Telares para recuperar la inversión en dos años | 86 | 86 |

La ganancia del equipo no cambia porque en el paquete el hardware se cobra al costo ($290.000 − $286.079 = $3.921). Repartido como en la Modalidad de Inversión (sección 5.2), son los $2.382 del software más $1.539 por los planos, que es la parte de la recuperación que ahí le toca al hardware.

La garantía cubre el software, el firmware y los planos; el armado y los componentes quedan a cargo de quien arma el gabinete. A cambio de llegar a fábricas de cualquier lugar sin fabricar ni viajar a instalar, el equipo no controla la calidad del armado. El detalle está en la Estimación de Costos (sección 4.3) y en la Modalidad de Inversión (sección 5.4); en la presentación es la diapositiva que sigue a la del precio, y en el diagrama `estimacion.svg`, el recuadro de abajo. Cómo arma el gabinete el técnico de la fábrica está en el Manual del telar en fábrica, sección 3.4.

## Lo que conviene decir en la presentación

- **El dinero puesto se recupera en el primer semestre.** Cada telar deja $3.921 al venderse y $20.000 por mes de abono; con los primeros 18 telares se cubren los $231.789 que puso el equipo.
- **Toda la inversión, en dos años, pide unos 86 telares (9 fábricas).** Como referencia, la planta del cliente tiene 14 telares, así que son unas seis plantas como esa. La mayor parte de la inversión es el valor de las 915 horas-persona del equipo, y es lo que más tarda en volver.
- **A un ritmo más realista para empezar, la recuperación tarda más.** Con una fábrica de 10 telares por semestre, se recupera todo en unos 3 años, con 60 telares.
- **También se puede vender con los planos.** La fábrica arma el gabinete con su técnico y paga $3.921 por telar más el abono; el equipo gana lo mismo y la inversión se recupera igual.
- **Estos cálculos no incluyen inflación ni impuestos.** El precio es una referencia a noviembre de 2026, con el dólar a $1.525.

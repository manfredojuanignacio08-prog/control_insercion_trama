# Precio con recuperación a dos años

Este es el cálculo del precio final de la presentación: **$600.000 por telar más un abono de $20.000 por mes por telar**. Desde el 02/11/2026 aparece en:

- la Estimación de Costos (sección 4.1);
- la Modalidad de Inversión;
- la Documentación de Proyecto (sección 8 y su sitio);
- el diagrama `diagramas/sistema/estimacion.svg`.

Reemplaza al precio anterior de $3.200.000 por telar (19 telares en dos años). Ese precio era demasiado alto para una fábrica, contaba 28 h de instalación por telar y no contaba el abono.

El 03/11/2026 se recalculó con las horas y las tarifas nuevas de cada rol del Gantt. El precio y el abono no cambian.

## Inversión a recuperar: $33.143.881

| Concepto | Monto |
|---|---|
| Horas del equipo: 1.666 horas-persona (sobre 642 h de tareas), con las horas y la tarifa de cada rol del Gantt (tabla de personal de la Estimación v4) | $32.912.092 |
| Componentes del telar piloto | $154.739 |
| Insumos materiales ($15.000 + 7 %) | $16.050 |
| Claude Pro (USD 40 × $1.525) | $61.000 |

Las horas y tarifas por rol son estas. Cada tarifa se pasa a pesos a $1.525 por dólar y lleva 5 % de contingencia:

| Rol | Horas | USD/h | Subtotal |
|---|---|---|---|
| PM | 351 | 14 | $7.868.542 |
| D01 | 98 | 14 | $2.196.915 |
| D02 | 218 | 14 | $4.887.015 |
| IM01 | 307 | 12 | $5.899.005 |
| IM02 | 151 | 12 | $2.901.465 |
| IR | 121 | 12 | $2.325.015 |
| BD | 34 | 12 | $653.310 |
| DUX | 146 | 10 | $2.337.825 |
| ELE | 163 | 10 | $2.610.038 |
| MUL | 77 | 10 | $1.232.962 |

De ese total, el dinero que el equipo puso de verdad es **$231.789**. Son los componentes, los insumos y Claude Pro. El resto es el valor de las horas de trabajo.

## Lo que cuesta cada telar nuevo: $266.864

- **Componentes: $154.739.** Se vuelven a comprar en cada telar. Desde el 02/11 incluyen la plaqueta de los puentes rectificadores y sus tiras de 4 pines ($3.900).
- **Insumos de armado: $16.050.**
- **Mano de obra: 6 h × $15.250 (tarifa de Electrónica, USD 10) × 1,05 = $96.075.** Se reparte así:
  - 3 h de armado del gabinete en el taller, con las plaquetas ya diseñadas;
  - 2 h de instalación y prueba en el telar;
  - 1 h de capacitación.

Las 28 h del cálculo anterior eran las del telar piloto: incluían medir la máquina y ajustar el diseño, y eso no se repite. El software no se vuelve a pagar en cada cliente.

**Ganancia por telar: $600.000 − $266.864 = $333.136.**

## El abono: $20.000 por mes por telar

El abono suma unos USD 13 por telar. Una fábrica de 10 telares paga $200.000 por mes. Con él se pagan los costos fijos del servicio, que son los mismos para todos los clientes: **$96.075 por mes** desde el primer cliente.

- 4 h de desarrollo por mes, para el mantenimiento del código: 4 h × $21.350 (USD 14) = $85.400.
- El servidor y el dominio: unos USD 7 por mes, $10.675. Hoy no cuestan nada porque los datos son pocos.

Lo que sobra del abono va a la recuperación.

## Cuántos telares hacen falta en dos años

Los telares se venden a ritmo parejo, y cada uno paga el abono desde el mes siguiente a su instalación.

| Precio por telar | Ganancia por telar | Telares para recuperar en 2 años |
|---|---|---|
| $550.000 | $283.136 | 70 |
| **$600.000** | **$333.136** | **63 (≈ 6 fábricas de 10 telares)** |
| $650.000 | $383.136 | 58 |
| $600.000, con abono de $25.000 | $333.136 | 58 |

Con unos 16 telares por semestre a $600.000 (63 en total), el saldo acumulado queda así:

| Momento | Saldo |
|---|---|
| Inicio | −$33,1 M |
| Semestre 1 | −$27,7 M |
| Semestre 2 | −$20,3 M |
| Semestre 3 | −$11,1 M |
| Semestre 4 | +$0,03 M |

## Lo que conviene decir en la presentación

- **El dinero puesto se recupera con el primer telar.** Cada telar deja $333.136, y el equipo puso $231.789.
- **Toda la inversión, en dos años, pide unos 63 telares (6 fábricas).** Como referencia, la planta del cliente tiene 11 telares, así que son unas seis plantas como esa. La mayor parte de la inversión es el valor de las 1.666 horas-persona del equipo, y es lo que más tarda en volver.
- **A un ritmo más realista para empezar, la recuperación tarda más.** Con una fábrica de 10 telares por semestre, se recupera todo en unos 2 años y 10 meses, con 57 telares.
- **Estos cálculos no incluyen inflación ni impuestos.** El precio es una referencia a noviembre de 2026, con el dólar a $1.525.

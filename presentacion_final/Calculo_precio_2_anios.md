# Precio con recuperación a dos años

Este es el cálculo del precio final de la presentación: **$600.000 por telar más un abono de $20.000 por mes por telar**. Desde el 02/11/2026 aparece en:

- la Estimación de Costos (sección 4.1);
- la Modalidad de Inversión;
- la Documentación de Proyecto (sección 8 y su sitio);
- el diagrama `diagramas/sistema/estimacion.svg`.

Reemplaza al precio anterior de $3.200.000 por telar (19 telares en dos años). Ese precio era demasiado alto para una fábrica, contaba 28 h de instalación por telar y no contaba el abono.

## Inversión a recuperar: $32.025.088

| Concepto | Monto |
|---|---|
| Horas del equipo: 642 h, con la tarifa de cada rol del Gantt (tabla de personal de la Estimación v4) | $31.793.299 |
| Componentes del telar piloto | $154.739 |
| Insumos materiales ($15.000 + 7 %) | $16.050 |
| Claude Pro (USD 40 × $1.525) | $61.000 |

De ese total, el dinero que el equipo puso de verdad es **$231.789**. Son los componentes, los insumos y Claude Pro. El resto es el valor de las horas de trabajo.

## Lo que cuesta cada telar nuevo: $459.014

- **Componentes: $154.739.** Se vuelven a comprar en cada telar. Desde el 02/11 incluyen la plaqueta de los puentes rectificadores y sus tiras de 4 pines ($3.900).
- **Insumos de armado: $16.050.**
- **Mano de obra: 6 h × $45.750 × 1,05 = $288.225.** Se reparte así:
  - 3 h de armado del gabinete en el taller, con las plaquetas ya diseñadas;
  - 2 h de instalación y prueba en el telar;
  - 1 h de capacitación.

Las 28 h del cálculo anterior eran las del telar piloto: incluían medir la máquina y ajustar el diseño, y eso no se repite. El software no se vuelve a pagar en cada cliente.

**Ganancia por telar: $600.000 − $459.014 = $140.986.**

## El abono: $20.000 por mes por telar

El abono suma unos USD 13 por telar. Una fábrica de 10 telares paga $200.000 por mes. Con él se pagan los costos fijos del servicio, que son los mismos para todos los clientes: **$218.075 por mes** desde el primer cliente.

- 4 h de desarrollo por mes, para el mantenimiento del código: $207.400.
- El servidor y el dominio: unos USD 7 por mes, $10.675. Hoy no cuestan nada porque los datos son pocos.

Lo que sobra del abono va a la recuperación.

## Cuántos telares hacen falta en dos años

Los telares se venden a ritmo parejo, y cada uno paga el abono desde el mes siguiente a su instalación.

| Precio por telar | Ganancia por telar | Telares para recuperar en 2 años |
|---|---|---|
| $550.000 | $90.986 | 117 |
| **$600.000** | **$140.986** | **101 (≈ 10 fábricas de 10 telares)** |
| $650.000 | $190.986 | 89 |
| $600.000, con abono de $25.000 | $140.986 | 87 |

Con unos 25 telares por semestre a $600.000 (101 en total), el saldo acumulado queda así:

| Momento | Saldo |
|---|---|
| Inicio | −$32,0 M |
| Semestre 1 | −$28,5 M |
| Semestre 2 | −$22,0 M |
| Semestre 3 | −$12,4 M |
| Semestre 4 | +$0,2 M |

## Lo que conviene decir en la presentación

- **El dinero puesto se recupera con los dos primeros telares.** Cada telar deja $140.986, y el equipo puso $231.789.
- **Toda la inversión, en dos años, pide unos 100 telares (10 fábricas).** Como referencia, la planta del cliente tiene 11 telares, así que son unas nueve plantas como esa. Es un ritmo exigente. La mayor parte de la inversión es el valor de las 642 horas del equipo, y es lo que más tarda en volver.
- **A un ritmo más realista para empezar, la recuperación tarda más.** Con una fábrica de 10 telares por semestre, se recupera todo en unos 3 años y 8 meses, con 73 telares.
- **Estos cálculos no incluyen inflación ni impuestos.** El precio es una referencia a noviembre de 2026, con el dólar a $1.525.

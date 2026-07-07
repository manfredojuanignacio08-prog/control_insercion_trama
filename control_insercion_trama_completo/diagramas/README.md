# Diagramas del proyecto

Los dos diagramas del sistema, juntos en un solo lugar (SVG vectorial +
PNG en alta resolución, listos para imprimir o pegar en Word/PowerPoint).

## 1. `diagrama_logico_arquitectura.svg` / `.png`

**Diagrama lógico**: cómo se conectan entre sí los componentes del
sistema — la página web, backend, base de datos, ESP32 y telar físico — y
qué protocolo usa cada conexión (API REST, SQL, sondeo HTTP, pulso de
relé). Incluye la aclaración de que la web de demostración no es parte
del producto.

Útil para explicar la **arquitectura** del proyecto: quién le habla a
quién y por qué.

## 2. `diagrama_conexion_electrica.svg` / `.png`

**Diagrama físico/eléctrico**: el cableado real del ESP32 — las 4 etapas
del circuito (potencia desde los 24V del telar, control a 5V, lógica a
3.3V, y actuación con los relés sobre la botonera), con las mejoras de
protección recomendadas marcadas en ámbar. Es una copia del mismo archivo
que está en `esp32/`, puesto acá también para tener ambos diagramas juntos.

Útil para explicar cómo está **cableado** el ESP32 al telar, componente
por componente.

## 3. `arbol_problemas_soluciones.svg` / `.png`

**Árbol de problemas y soluciones**: la lógica que justifica el proyecto.
A la izquierda, el árbol de problemas (problema central, sus causas/raíces y
sus efectos); a la derecha, el árbol de soluciones (el objetivo y cómo cada
causa se convirtió en una acción concreta); y abajo, el recorrido de 6 pasos
de cómo se fue llegando a la solución. El mismo contenido en texto está en
`docs/Arbol_Problemas_y_Soluciones.md`.

Útil para explicar **por qué** se hizo el proyecto y cómo se razonó la
solución.

## Cuál mirar según la pregunta

| Si preguntan... | Mirar |
|---|---|
| "¿Cómo se conecta la app con la base de datos?" | Diagrama lógico |
| "¿Por qué el ESP32 no rompe el backend al agregarlo?" | Diagrama lógico |
| "¿Cómo está cableado el ESP32 al telar?" | Diagrama eléctrico |
| "¿Qué protecciones eléctricas tiene el circuito?" | Diagrama eléctrico |
| "¿Por qué se hizo el proyecto? ¿Cómo llegaron a la solución?" | Árbol de problemas y soluciones |

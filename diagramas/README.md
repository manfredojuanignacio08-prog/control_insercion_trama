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
del circuito (alimentación con fuente propia HLK-5M05 desde 220V, lógica a
3.3V hacia los 3 relés, actuación sobre la botonera de 24V AC, y sensado
por optoacopladores de esos mismos tres botones, para detectar el uso manual), con las
mejoras de protección recomendadas marcadas en ámbar. Es una copia del mismo archivo
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

## 4. `diagrama_nivel2_marcos`

**Etapa de marcos del Nivel 2 (evolución).** Muestra cómo el ESP32 dictaría
la secuencia del dibujo moviendo los marcos del telar: backend → ESP32 →
GPIO del ESP32 → relés de estado sólido (SSR) → los lectores ópticos del telar
→ telar. Es el diagrama del Nivel 2 (control del tejido), a diferencia del
eléctrico que es el Nivel 1 (arranque/pausa).

## Cuál mirar según la pregunta

| Si preguntan... | Mirar |
|---|---|
| "¿Cómo se conecta la app con la base de datos?" | Diagrama lógico |
| "¿Por qué el ESP32 no rompe el backend al agregarlo?" | Diagrama lógico |
| "¿Cómo está cableado el ESP32 al telar?" | Diagrama eléctrico |
| "¿Qué protecciones eléctricas tiene el circuito?" | Diagrama eléctrico |
| "¿Por qué se hizo el proyecto? ¿Cómo llegaron a la solución?" | Árbol de problemas y soluciones |
| "¿Cómo controlaría el ESP32 los marcos para tejer el dibujo?" | Nivel 2 (marcos) |

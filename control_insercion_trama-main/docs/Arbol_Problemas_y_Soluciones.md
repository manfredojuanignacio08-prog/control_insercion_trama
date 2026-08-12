# Árbol de problemas y soluciones — Control de Inserción de Trama

Este documento explica **cómo se llegó a la solución del proyecto**: primero
identificando el problema central, sus causas y sus efectos (árbol de
problemas), y después convirtiendo cada uno de esos puntos en un objetivo
alcanzable (árbol de soluciones). Es la lógica que justifica por qué el
sistema quedó como quedó.

---

## PARTE 1 — Árbol de problemas

Un árbol de problemas se lee de abajo hacia arriba: las **raíces** son las
causas, el **tronco** es el problema central, y las **ramas** son los efectos
o consecuencias.

### 🌳 Problema central (el tronco)

> **El diseño y el control de los patrones de tejido en el telar es un
> proceso manual, sin registro digital ni forma de repetirlo con exactitud.**

### 🌱 Causas (las raíces — por qué pasa)

1. **El patrón de tejido se define a mano o de memoria.** No hay una
   herramienta para diseñarlo visualmente ni para guardarlo.
2. **No existe una base de datos ni un sistema central.** La información, si
   se anota, queda en papel o en archivos sueltos.
3. **El telar no está conectado a ningún sistema informático.** La máquina y
   cualquier registro digital viven en mundos separados.
4. **El prototipo inicial guardaba todo en el navegador (`localStorage`).**
   Dependía de un único dispositivo: si se cambiaba de máquina o se borraba
   el caché, se perdía todo.
5. **No hay trazabilidad de la producción.** No queda registro de qué se
   tejió, cuándo, ni cuánto avanzó cada trabajo.

### 🍂 Efectos (las ramas — qué consecuencias trae)

1. **Se pierde tiempo** reconfigurando patrones que ya se habían hecho antes.
2. **Es fácil cometer errores** al cargar un patrón a mano, y difícil
   detectarlos.
3. **No se puede repetir un diseño exacto** en otro momento o en otra
   máquina.
4. **No hay historial** para analizar la producción ni para auditar qué pasó.
5. **El conocimiento depende de la persona**, no del sistema: si esa persona
   no está, se complica.

---

## PARTE 2 — Árbol de soluciones

El árbol de soluciones es el espejo positivo del anterior: cada causa se
convierte en un **medio** (una acción concreta que se implementó) y cada
efecto negativo se convierte en un **fin** (un beneficio logrado).

### 🎯 Objetivo central (el tronco, en positivo)

> **Digitalizar el diseño y el control de los patrones de tejido, con un
> sistema central que guarda todo y que puede conectarse al telar físico.**

### 🌱 Medios (lo que se hizo para atacar cada causa)

1. **Se creó un editor visual de patrones** (la página web): una cuadrícula
   donde se define, celda por celda, cuántas pasadas lleva cada punto, con
   colores por fila. → ataca la causa 1.
2. **Se diseñó una base de datos central (PostgreSQL en Supabase)** con 4
   tablas: patrones, telares, historial y errores. → ataca las causas 2 y 5.
3. **Se construyó un backend (Node.js + Express)** que expone una API REST:
   es el intermediario único entre la interfaz, la base de datos y el telar.
   → ataca la causa 2 y habilita la 3.
4. **Se reemplazó el `localStorage` por la base de datos real:** ahora cada
   acción se guarda en el servidor al instante, no en el navegador. → ataca
   la causa 4.
5. **Se desarrolló el firmware del ESP32** que conecta el telar físico al
   sistema, accionando los relés de Marcha/Pausa según lo que indica el
   backend. → ataca la causa 3.
6. **Se registró el historial de producción y un log de errores** en la base
   de datos. → ataca la causa 5.

### 🍎 Fines (los beneficios que se obtienen)

1. **Se ahorra tiempo:** un patrón guardado se reutiliza en segundos.
2. **Se reducen los errores:** el editor valida los datos y el sistema
   controla la consistencia.
3. **Se puede repetir un diseño exacto** las veces que haga falta, en el
   telar que sea.
4. **Queda trazabilidad completa:** el historial registra qué, cuándo y
   cuánto.
5. **El conocimiento vive en el sistema**, no en una sola persona.

---

## PARTE 3 — Cómo se llegó a la solución (el recorrido)

La solución no salió de una sola idea, sino de ir resolviendo problemas a
medida que aparecían. Este es el camino real que siguió el proyecto:

1. **Punto de partida:** había un prototipo que solo funcionaba en el
   navegador, con todo guardado en `localStorage`. Servía para dibujar, pero
   no era un sistema: sin servidor, sin base de datos, sin conexión a nada.

2. **Primer problema detectado — "los datos se pierden y no se comparten".**
   → Solución: montar un **backend con base de datos**. Se diseñó el modelo
   de 4 tablas y se construyó la API REST. La web se reconectó para hablar
   con esa API en vez de con `localStorage`.

3. **Segundo problema — "¿dónde se aloja la base de datos?".**
   → Solución: **PostgreSQL en Supabase**, en la nube, para no depender de un
   servidor propio ni de una sola máquina, y tener respaldos y acceso remoto.

4. **Tercer problema — "el sistema tiene que poder repetir un patrón sin
   errores y sin pisarse si se usa a la vez".**
   → Solución: se sumaron **transacciones y bloqueo de filas** en el backend,
   para que las operaciones críticas (asignar un patrón, avanzar el tejido)
   sean seguras y consistentes.

5. **Cuarto problema — "esto sigue siendo software; el telar real no está
   conectado".**
   → Solución: se diseñó el **ESP32 como gateway**, que consulta el estado al
   backend y acciona los botones de Marcha/Pausa del telar mediante relés en
   paralelo, sin invadir la electrónica de la máquina y con comportamiento
   seguro ante fallas (fail-safe).

6. **Quinto problema — "hay que poder usarlo cómodo, en el piso de planta".**
   → Solución: la **página web pensada para el celular** (mobile-first), con
   modo claro y oscuro, para operarla desde el teléfono sin depender de una
   computadora.

**Resultado:** un sistema donde el problema central —el proceso manual y sin
registro— quedó resuelto de punta a punta: se diseña en la web, se guarda en
la base de datos a través del backend, y (en la etapa final de hardware) se
ejecuta en el telar real mediante el ESP32.

---

*Ver también el diagrama visual de este mismo contenido:*
`arbol_problemas_soluciones.svg` / `.png` en la carpeta `diagramas/`.

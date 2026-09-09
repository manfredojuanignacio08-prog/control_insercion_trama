# Backend del Nivel 2, en desarrollo

Endpoints que necesita el firmware del Nivel 2 y que todavía **no están montados
en el servidor en producción**. Se mantienen aparte del resto del backend a
propósito: el Nivel 1 ya funciona y no conviene tocarlo mientras se desarrolla
esta etapa.

## Qué agrega

| Endpoint | Para qué |
|---|---|
| `GET /telares/:id/patron-actual` | El firmware descarga la matriz del dibujo asignado |
| `POST /telares/:id/pasadas` | El firmware reporta el conteo real del sensor |

## Cómo montarlo cuando llegue el momento

En `server.js`, junto a las rutas que ya existen:

```js
import nivel2Router from './nivel2/nivel2.routes.js';
app.use('/api/telares', nivel2Router);
```

## Antes de eso

El conteo que llega por `POST /pasadas` es el del sensor inductivo. Mientras ese
sensor no esté instalado y validado contra el contador mecánico del telar durante
una jornada completa, los números que reporte no deben tomarse como buenos.

# Scripts SQL de referencia

- `01_base_de_datos_completa.sql`, esquema completo para **PostgreSQL /
  Neon** (el motor del proyecto): `backend/src/db/schema.sql` más todas las
  migraciones en orden, y al final las registra en `migraciones_aplicadas`
  para que el servidor no las vuelva a correr. Sirve para crear la base de
  una sola vez desde el editor SQL de Neon.

  En la práctica conviene usar los scripts de la carpeta `backend/`:
  `npm run init-db` (ejecuta `backend/src/db/schema.sql`, la fuente de verdad
  del esquema) y `npm run migrate`; el servidor además aplica solo las
  migraciones pendientes al arrancar.

  Este archivo **no se edita a mano**: se genera con `npm run generar-sql`
  (desde `backend/`). Hay que regenerarlo cada vez que se agrega una
  migración.

Nota: el repositorio original traía un segundo script escrito para MariaDB;
se quitó de este paquete porque el proyecto usa PostgreSQL/Neon y ese
archivo solo generaba confusión.

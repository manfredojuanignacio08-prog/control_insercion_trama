# Scripts SQL de referencia

- `01_base_de_datos_completa.sql` — esquema completo para **PostgreSQL /
  Supabase** (el motor del proyecto). Es material de referencia: para crear
  las tablas en la práctica conviene usar `npm run init-db` desde la
  carpeta `backend/`, que ejecuta `backend/src/db/schema.sql` (la fuente de
  verdad del esquema) contra la base configurada en el `.env`.

Nota: el repositorio original traía un segundo script escrito para MariaDB;
se quitó de este paquete porque el proyecto usa PostgreSQL/Supabase y ese
archivo solo generaba confusión.

# Scripts de verificación

Estos scripts verifican el diseño del sistema por software (sin hardware):

- **`verif_coherencia.py`** — compara el firmware (.ino), el diagrama eléctrico
  (SVG) y el documento de conexiones, y confirma que los pines, voltajes y
  conexiones coincidan entre los tres (12 chequeos).
- **`sim_flujo.py`** — simula el flujo lógico del Nivel 1 (Marcha/Pausa):
  arranque seguro, arranque/detención, sin doble-pulso (6 verificaciones).
- **`sim_nivel2.py`** — simula el flujo lógico del Nivel 2 (marcos/dobby):
  traducción de la matriz de pasadas a la secuencia de marcos y su repetición
  (6 verificaciones).

Para correrlos: `python3 <script>.py` (desde el proyecto, ajustando las rutas
de los archivos que leen si hiciera falta).

**Importante:** estas verificaciones aseguran que el diseño es coherente y la
lógica correcta, pero NO reemplazan la validación física con multímetro. Para
eso está `../CHECKLIST_VALIDACION.md`.

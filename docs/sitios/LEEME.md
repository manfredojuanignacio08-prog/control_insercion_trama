# Sitios web de la carpeta

Las versiones web de los documentos, para leerlas desde el navegador. Son páginas
estáticas: se abren con doble clic en `index.html` o se suben tal cual a cualquier
hosting de páginas estáticas (por ejemplo, GitHub Pages).

| Carpeta | Qué es | De qué documento sale |
|---|---|---|
| `web_doc/` | La Documentación de Proyecto completa, con las fotos del telar, del armado y de la aplicación, el modelo de datos y una demostración de la grilla | `documentacion_proyecto/Documentación_de_Proyecto.docx` |
| `manuales/` | Los dos manuales de uso, en pestañas: la aplicación web y el telar en fábrica, cada uno con su guía de inicio rápido | `documentacion_proyecto/Manual_Pagina_Web_Telar.docx` y `documentacion_proyecto/Manual Telar Fabrica.docx` |

## Mantenerlos al día

El Word es la fuente. Cuando cambia un documento, hay que pasar el cambio al sitio
correspondiente:

- Los textos están en el `index.html` de cada sitio.
- Las capturas del manual web son `manuales/img/web_imageN.jpg` y las del manual de
  fábrica `manuales/img/fab_imageN.jpg`. El número coincide con la imagen
  `word/media/imageN` del Word correspondiente.
- Las capturas de la aplicación en la documentación están en `web_doc/fotos/app-*.jpg`
  (las mismas de las figuras 6 a 8 del Word).
- Los diagramas de la base (`web_doc/ERD_completo.*`, `web_doc/DER_*.*`,
  `web_doc/doc-fig1.png` a `doc-fig3.png`) son copias de `diagramas/sistema/`.

`web_doc/ERD_Sistema_Telares.html` y `web_doc/3FN_Sistema_Telares.html` venían en la
carpeta original y no están enlazados desde el sitio: muestran el esquema viejo de la
base, sin las columnas del hilado, los intercalados ni el modo invitado. El modelo de
datos actual está en la sección 3.2.3 del sitio y en `diagramas/sistema/ERD.svg`.

# Documentación del proyecto

Los documentos de la Carpeta del Proyecto, en su versión vigente. Se incluyen en
el repositorio para que el código y la documentación viajen juntos.

## Documentos principales

| Archivo | Qué contiene |
|---|---|
| `Estado_Completo_del_Proyecto.docx` | **Empezar por acá.** Resume todo: qué es el proyecto, qué se construyó, las decisiones técnicas y su fundamento, y lo que falta. |
| `Documentación_de_Proyecto.docx` | El documento formal completo, con 70 secciones numeradas, 15 tablas y 13 figuras. |
| `Bitácora.docx` | Registro cronológico de avances y decisiones. |
| `Registro de Entrevistas.docx` | Las minutas de las ocho reuniones con el cliente; la última, del 30/10/2026, es la prueba del proyecto completo, con los dos videos. |
| `Recorrido_del_Codigo_y_Herramientas.docx` | Cómo está armado el código por dentro (la web, el servidor, la base de datos y el firmware), cómo viaja una orden de punta a punta y las herramientas usadas, incluida la inteligencia artificial. Cinco páginas; en Markdown en `docs/analisis/`. |

## Guías de trabajo

| Archivo | Qué contiene |
|---|---|
| `Guia_Conexion_y_Puesta_en_Marcha.docx` | **El paso a paso de todo:** las seis plaquetas (las cinco soldadas y la del ESP32), cómo se conectan entre sí y al telar, cómo levantar el servidor, la web y el ESP32, y qué muestra la web cuando se usa la botonera. |
| `Guia_Conexion_Reles_LCA110.docx` | Los relés de selección: mediciones, la conexión final (la más segura), pruebas y problemas frecuentes. |
| `Guia_Mediciones_y_Verificaciones.docx` | Todas las mediciones y pruebas, en orden, con la planilla para anotar. |
| `Conexionado_Nivel2.docx` | El paso a paso del sensor de pasada y los relés, con sus diagramas. |
| `Conexiones_de_las_plaquetas.docx` | El resumen de las conexiones de las plaquetas (las cinco soldadas y, desde el 25/10/2026, la del ESP32), pata por pata, para quien las arma, con lo que se marcó para corregir del diseño en Proteus antes de soldarlas. |
| `Guia_Bloques_C_y_D.docx` | Qué falta hacer en esos dos bloques y en qué orden. |
| `Checklist_verificaciones.xlsx` | Las 26 verificaciones antes y durante la instalación. |
| `Componentes_en_placa.xlsx` | Los componentes de la placa, con su ubicación. |

## Economía y planificación

| Archivo | Qué contiene |
|---|---|
| `Lista_de_componentes_Control_Trama.xlsx` | Todos los componentes por bloque, con precios y notas. |
| `Estimacion_Costos_Ganancia_Contrato_v4.docx` | Costos, márgenes y condiciones del servicio. |
| `Gantt_2026 - Automatizacion de Telar Industrial.xlsx` | El cronograma, con 169 tareas en 8 etapas. |

## Inversión y armado

| Archivo | Qué contiene |
|---|---|
| `Modalidad_Inversion_Ganancia_Contrato_Garantia.docx` | Modalidad de inversión mixta, plan de aportes por etapa, recuperación y garantía. |
| `Guia_Armado_Bloque_A.docx` | El paso a paso del armado del nodo de control, fase por fase. |

## Otros

`Manual Telar Fabrica.docx` y `Manual_Pagina_Web_Telar.docx` son los manuales de
uso. Sus versiones web, y la de la Documentación de Proyecto, están en sus propios
repositorios: cuando cambia uno de estos Word, hay que pasar el cambio al sitio.
`Arbol de problemas y soluciones.docx` es el análisis causa-efecto.
`Parado_Automatico_Ideas.docx` recoge las ideas surgidas de las conversaciones
con el dueño, ordenadas por prioridad.

La carpeta `PDF/` tiene cada uno de estos Word en PDF, con el mismo nombre, para leerlos o
imprimirlos sin Word. Si se cambia un Word, hay que volver a exportar su PDF.

# Control de Inserción de Trama — Paquete completo

Sistema para diseñar y administrar los patrones de tejido de los telares.
El frontend (página web) ya está conectado al backend (API Node.js + PostgreSQL).

```
├── database/   → el SQL listo para crear/actualizar la base de datos
├── backend/    → servidor completo (API + frontend integrado en /public)
└── docs/
    ├── Como_Crear_La_Base_De_Datos.md             ← EMPEZAR ACÁ (100% desde el navegador)
    ├── Manual_Instalacion_y_Funcionamiento.md     guía de instalación y uso del backend
    └── Analisis_Frontend_y_Plan_Backend.md        análisis técnico y decisiones de diseño
```

## 📖 Por dónde empezar

1. **`docs/Como_Crear_La_Base_De_Datos.md`** — crear la base de datos en Supabase,
   paso a paso, todo con clicks en el navegador (sin terminal).
2. **`docs/Manual_Instalacion_y_Funcionamiento.md`** — desplegar el backend en
   Render y conectarlo a esa base (sección 3.5, también 100% desde el navegador).

## Inicio rápido con Docker (alternativa local, con terminal)

```bash
cd backend
docker compose up -d --build
# Abrir http://localhost:3000
```

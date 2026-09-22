# CambiarTuBateria – Catálogo Web (Estructura Limpia)

Este proyecto replica con mejor arquitectura el catálogo de baterías premium, separando claramente frontend y backend para evitar código espagueti.

## Estructura

```
pagbateria/
├── index.php                     # Redirección a /public para servir el frontend
├── public/                       # Frontend (HTML, CSS, JS)
│   ├── index.html
│   └── assets/
│       ├── css/styles.css
│       ├── js/app.js
│       └── img/
└── backend/                      # Backend ligero en PHP (APIs + datos)
    ├── api/
    │   ├── products.php          # GET /products.php?brand=...&q=...
    │   ├── brands.php            # GET /brands.php
    │   └── contact.php           # POST /contact.php
    ├── data/
    │   ├── products.json
    │   ├── brands.json
    │   └── contacts.log          # (se crea al primer envío)
    └── lib/
        └── response.php          # Helper para respuestas JSON y CORS
```

## Requisitos

- XAMPP (Apache + PHP) en Windows.
- Ruta del proyecto: `c:/xampp/htdocs/pagbateria`

## Cómo ejecutar

1. Inicia Apache en XAMPP.
2. Abre en tu navegador: `http://localhost/pagbateria/`

## APIs

- GET `http://localhost/pagbateria/backend/api/brands.php`
- GET `http://localhost/pagbateria/backend/api/products.php?brand=Bosch&q=BMW`
- POST `http://localhost/pagbateria/backend/api/contact.php`
  - Campos: `name`, `phone`, `message`

## Personalización

- Productos y marcas: edita `backend/data/products.json` y `backend/data/brands.json`.
- Estilos: `public/assets/css/styles.css`.
- Comportamiento UI: `public/assets/js/app.js`.

## Seguridad/Producción

- Limitar CORS a tu dominio.
- Validar y sanitizar entradas del contacto (aquí se graban en `contacts.log` para demo).
- Servir sobre HTTPS.

## Licencia

Uso interno.

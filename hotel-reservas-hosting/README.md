# Hotel Reservas - paquete para hosting

Esta carpeta contiene solamente lo necesario para ejecutar la aplicacion en un hosting Node.js: backend, frontend ya compilado, base SQLite actual, comprobantes cargados y configuracion de instalacion. No incluye codigo de auditoria, pruebas, dependencias instaladas, builds intermedios ni respaldos anteriores.

## Requisitos del hosting

- Node.js 24 o superior.
- Un disco o volumen persistente. Las carpetas `data`, `uploads` y `backups` deben conservarse entre despliegues.
- Un unico servicio Node que exponga el puerto definido por `PORT`. La app atiende tanto la interfaz como la API en el mismo dominio.

## Puesta en marcha

1. Sube el contenido completo de esta carpeta al hosting.
2. Crea las variables de entorno del hosting basandote en `.env.example`. No subas un archivo `.env` con claves reales a un repositorio.
3. Instala solo las dependencias de produccion:

   ```bash
   npm install --omit=dev
   ```

4. Inicia la aplicacion:

   ```bash
   npm start
   ```

La interfaz quedara disponible en `https://tu-dominio.com/` y la API en `https://tu-dominio.com/api/`.

## Variables imprescindibles en produccion

- `AUTH_ENABLED=true`
- `SESSION_SECRET`: una cadena larga, aleatoria y privada.
- `CORS_ORIGIN`: el dominio publico exacto, por ejemplo `https://reservas.ejemplo.com`.
- `DATABASE_PATH=./data/hotel.sqlite`
- `UPLOADS_DIR=./uploads`
- `BACKUP_DIR=./backups`

La base incluida conserva los usuarios existentes. `ADMIN_PASSWORD` solo es necesario si se despliega una base vacia y se necesita crear el primer administrador. No se incluye ninguna clave real en este paquete.

## Actualizaciones y copias de seguridad

Antes de actualizar el hosting, guarda una copia de `data/hotel.sqlite` y de `uploads`. La aplicacion tambien crea respaldos operativos en `backups`; esa carpeta debe ser persistente, pero los respaldos antiguos no se incluyeron en este paquete inicial.

# Auditoria de seguridad y permisos (solo lectura)

Fecha: 2026-07-11. Alcance: backend Express, autenticacion, rutas, ficheros, importacion/exportacion y secretos. Se ejecuto el preflight de `codex-security:security-scan` con estado `ready`. Esta es una auditoria focalizada de permisos solicitada dentro de la auditoria funcional; no se modifico la aplicacion.

## Evidencia de acceso directo

Sin cabecera `Authorization`, contra la instancia en ejecucion `localhost:3001`, se obtuvieron `200` en `GET /api/health`, `/api/rooms`, `/api/reservations`, `/api/export/reservations.csv` y `/api/import/excel/template`. `/api/backups` y `/api/users` devolvieron 404 en esa instancia (la ruta fuente actual los protege con `requireRole('admin')`).

## Hallazgos

### SEC-01 — P1: datos y exportaciones de reservas accesibles a cualquier usuario autenticado

`requireAuth` solo autentica la solicitud, mientras casi todas las rutas operativas no usan `requireRole`. Cualquier rol valido, incluido `consulta` o `aseo`, puede acceder a reservas, pagos, adjuntos asociados, limpieza, dashboard, exportaciones e incluso mutar habitaciones/reservas/pagos/importaciones. La aplicacion no implementa autorizacion por recurso ni matriz de privilegios fuera de las pocas rutas que usan `requireRole`.

Evidencia: `backend/src/server.js:213-624`; la busqueda de `requireRole` solo devuelve auditoria, backups, usuarios, uploads y algunos endpoints de huespedes. Acceso directo no autenticado a exportacion de reservas respondio 200 en la instancia en ejecucion.

Impacto: exposicion de PII y datos financieros, y alteracion/destruccion de reservas por roles no administrativos. Corregir antes de cualquier despliegue multiusuario: aplicar `requireRole` a cada endpoint conforme a una politica central; restringir lectura/exportacion de PII y acciones destructivas a roles apropiados; añadir pruebas negativas por rol y URL directa.

### SEC-02 — P1: modo sin autenticacion cuando no hay usuarios ni ADMIN_PASSWORD

Cuando la base no contiene usuarios y `ADMIN_PASSWORD` esta vacia, `requireAuth` ejecuta `next()` para toda la API. Esto abre creacion, borrado, importaciones y exportaciones a cualquier cliente que alcance el servidor en la ventana de bootstrap.

Evidencia: `backend/src/server.js:82-94`. El servidor se liga por defecto a `0.0.0.0` y el README permite `ADMIN_PASSWORD` vacia.

Impacto: toma total de la aplicacion en primera instalacion o despues de una restauracion vacia. Corregir con un flujo de bootstrap de un solo uso, limitado a localhost y con secreto de instalacion obligatorio; negar por defecto todas las rutas salvo salud y bootstrap.

### SEC-03 — P2: CORS permisivo por defecto y secreto de sesion inseguro de respaldo

`CORS_ORIGIN` usa `*` por defecto. Ademas, las sesiones HMAC usan `SESSION_SECRET`, luego `ADMIN_PASSWORD`, y finalmente la cadena conocida `development-only-change-me`.

Evidencia: `backend/src/server.js:78`; `backend/src/services/auth.js:20-22`.

Impacto: una configuracion de produccion incompleta permite origenes arbitrarios y, si existe un usuario sin las variables configuradas, sesiones firmables con secreto publico. Exigir `SESSION_SECRET` criptograficamente aleatorio y lista explicita de origenes en produccion; abortar arranque fuera de desarrollo si faltan.

### SEC-04 — P2: health expone rutas locales del servidor

`GET /api/health`, excluido de autenticacion, responde `databasePath` y `uploadsDir`. Esto divulga estructura local y facilita ataques/soporte no autorizado.

Evidencia: `backend/src/server.js:81,175-177` y respuesta 200 observada.

Correccion: respuesta minima `{ok:true}` para clientes no autenticados y diagnostico detallado solo en localhost/admin.

### SEC-05 — P3: importacion de libros depende de tipos/metadatos controlados por cliente

El filtro de Excel/CSV acepta extension y MIME declarados por el cliente, y parsea en memoria hasta 25 MB. No hay verificacion de contenido, antivirus ni cuota/rate limit. CSV de exportacion si mitiga formulas con prefijo apostrofo (`exporter.js:5-10`), lo cual es positivo.

Evidencia: `backend/src/server.js:126-158`; `backend/src/services/exporter.js:5-10`. Riesgo adicional conocido: dependencia `xlsx` con avisos de seguridad pendientes.

Correccion: permitir importaciones solo a admin, verificar magic bytes/formato, mantener limites estrictos y sustituir/actualizar el parser vulnerable.

## Controles que si existen

- Hash de contrasenas con `scrypt` y comparacion temporizada (`auth.js:8-18`).
- Token de sesion con expiracion de 12 horas y usuario activo comprobado (`auth.js:23-49`).
- Descarga de uploads exige `admin` o `recepcion` y valida que el archivo este registrado (`server.js:206-211`).
- Backups, auditoria y gestion de usuarios exigen admin (`server.js:181-204`).
- Nombre de adjunto se normaliza y se permite una lista MIME; exportador neutraliza formulas CSV.

## Limitaciones y resultado

No se enviaron solicitudes mutantes, no se inspeccionaron secretos reales ni se usaron credenciales. La instancia en 3001 podria no corresponder exactamente al arbol fuente para rutas de backup/usuarios (devolvio 404), por lo que se distingue evidencia runtime de evidencia de codigo. Resultado: **NO APTO para despliegue multiusuario o exposicion fuera de red hasta resolver SEC-01 y SEC-02**.

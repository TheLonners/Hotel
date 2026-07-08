# Hotel Reservas Local

Aplicacion web local para gestionar reservas hoteleras con calendario tipo Airbnb, importacion desde Excel/CSV, pagos, saldos, comprobantes y exportacion compatible con el Excel actual.

## Estructura

```text
backend/   API Express, SQLite, importador, exportador y uploads
frontend/  Next.js + React + TypeScript
```

## Requisitos

- Node.js 24 o superior. El backend usa `node:sqlite` para evitar dependencias nativas externas y guardar una base SQLite local.
- pnpm o npm.
- Un computador servidor encendido dentro de la red local.

La aplicacion no usa servicios cloud obligatorios. Por defecto la base de datos queda en `data/hotel.sqlite` y los comprobantes en `uploads`.

## Instalacion

```bash
pnpm install
```

Tambien puedes usar npm con workspaces, pero `pnpm` es la ruta recomendada para este proyecto.

## Variables de entorno

Copia el ejemplo:

```bash
cd backend
cp .env.example .env
```

Variables principales:

```env
PORT=3000
HOST=0.0.0.0
DATABASE_PATH=./data/hotel.sqlite
UPLOADS_DIR=./uploads
CORS_ORIGIN=*
ADMIN_PASSWORD=
```

`ADMIN_PASSWORD` es opcional. Si lo defines, el frontend permite guardar esa clave desde el boton `Clave` y la enviara en cada llamada API.

## Crear base de datos y datos de ejemplo

La base SQLite se crea automaticamente al iniciar el backend. Para cargar habitaciones y reservas de ejemplo:

```bash
pnpm seed
```

El seed es opcional y no se ejecuta si ya existen habitaciones.

## Ejecutar en desarrollo

Terminal 1:

```bash
pnpm dev:backend
```

Terminal 2:

```bash
pnpm dev:frontend
```

Abre:

- Frontend desarrollo: `http://localhost:5173`
- API backend: `http://localhost:3000/api/health`

## Ejecutar para uso local en un solo puerto

Construye el frontend como sitio estatico de Next.js y deja que Express lo sirva desde `frontend/out`:

```bash
pnpm build
pnpm start
```

Abre:

- En el servidor: `http://localhost:3000`
- En otro celular o computador de la misma red: `http://IP_DEL_SERVIDOR:3000`

Para conocer la IP del servidor en Windows:

```powershell
ipconfig
```

Busca la IPv4 de la red Wi-Fi o Ethernet.

## Validar cambios tecnicos

Antes de publicar cambios importantes ejecuta:

```bash
pnpm typecheck
pnpm build
pnpm start
```

`pnpm typecheck` valida TypeScript sin depender de archivos generados en `.next`. `pnpm build` genera el frontend estatico en `frontend/out`.

## Importar el Excel actual

1. Entra a `Importar`.
2. Sube un archivo `.xlsx`, `.xls` o `.csv`.
3. Revisa la previsualizacion.
4. Revisa las alertas.
5. Confirma la importacion.

Columnas soportadas:

- `#`
- `NOMBRE`
- `email`
- `Teléfono`
- `CC`
- `Direccion` / `Dirección`
- `Huéspedes`
- `Habitación`
- `FECHA INGRESO`
- `Fecha Salida`
- `VALOR`
- `TOTAL`
- `ABONO`
- `SALDO`
- `FECHA ABONO`
- `BANCO`
- `Noches`
- `N° REMISION`
- `AIRBNB`
- `WHAT`
- `SIIGO`
- `QUEO`
- `OBSERVACIONES`

El importador convierte fechas seriales de Excel, conserva cedulas y telefonos como texto, detecta habitaciones multiples separadas por `Y`, comas o signos similares, crea habitaciones faltantes como pendientes de revisar y registra alertas sin bloquear errores leves.

## Exportar CSV

Desde el calendario usa:

- `Excel CSV`: exporta con columnas compatibles con el Excel actual.
- `Normalizado`: exporta columnas tecnicas.

Endpoints disponibles:

- `/api/export/reservations-excel-format.csv`
- `/api/export/reservations.csv`
- `/api/export/rooms.csv`
- `/api/export/payments.csv`
- `/api/export/balances.csv`

La exportacion de reservas respeta busqueda y filtros activos.

## Comprobantes

Los comprobantes se suben desde el panel lateral de una reserva. Se aceptan imagenes y PDF. Los archivos quedan localmente en:

```text
uploads
```

## Red local y acceso remoto opcional

Para red local, ejecuta el backend con:

```env
HOST=0.0.0.0
PORT=3000
```

Luego abre `http://IP_DEL_SERVIDOR:3000` desde el celular o computador conectado a la misma red.

Para acceso remoto puedes exponer ese mismo puerto con una herramienta externa:

- Tailscale: instala Tailscale en servidor y dispositivo remoto, luego abre `http://IP_TAILSCALE:3000`.
- Cloudflare Tunnel: crea un tunnel hacia `http://localhost:3000`.
- ngrok: ejecuta `ngrok http 3000` y abre la URL generada.
- VPN propia: entra a la VPN y usa la IP interna del servidor.

Si expones la app fuera de la red local, configura `ADMIN_PASSWORD`.

## Funciones incluidas en el MVP

- Habitaciones CRUD con estado, capacidad, precio, color y pendiente de revisar.
- Reservas manuales con una o varias habitaciones.
- Validacion de cruces contra reservas, bloqueos y habitaciones no disponibles.
- Calendario escritorio con habitaciones a la izquierda, dias arriba y barras por reserva.
- Panel lateral de detalle y edicion.
- Pagos independientes, saldo calculado y marcado como pagado.
- Comprobantes locales en imagen o PDF.
- Importacion Excel/CSV con previsualizacion y alertas.
- Exportacion CSV compatible con el Excel actual y normalizada.
- Dashboard con indicadores basados en SQLite.
- Vista movil con acciones, busqueda y tarjetas.

## Endpoints principales

- `GET /api/rooms`
- `POST /api/rooms`
- `PUT /api/rooms/:id`
- `DELETE /api/rooms/:id`
- `GET /api/reservations`
- `GET /api/reservations/:id`
- `POST /api/reservations`
- `PUT /api/reservations/:id`
- `DELETE /api/reservations/:id`
- `GET /api/availability?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&guests=2`
- `POST /api/import/excel/preview`
- `POST /api/import/excel/confirm`
- `GET /api/dashboard`

# Mapa funcional inicial — auditoría 2026-07-11

## Alcance y evidencia

Inventario estático previo a pruebas, sin cambios a código de aplicación. Fuentes: `frontend/src/App.tsx`, `frontend/src/app/**`, `frontend/src/services/api.ts`, `backend/src/server.js`, `backend/src/database/db.js` y servicios en `backend/src/services/`.

### Arquitectura confirmada

| Capa | Implementación real | Evidencia |
|---|---|---|
| Cliente | Next.js 15 / React 19 / TypeScript; export estático servido por Express | `frontend/package.json`, `frontend/next.config.mjs`, `backend/src/server.js:906` |
| API | Express 4, JSON y Multer | `backend/src/server.js:1-171` |
| Persistencia | **SQLite local**, `node:sqlite` (`DatabaseSync`), WAL, FK habilitadas | `backend/src/database/db.js:1-22` |
| Archivo de datos | `data/hotel.sqlite` salvo `DATABASE_PATH` | `backend/src/database/db.js:6-10` |
| Archivos | comprobantes en `uploads/` | `backend/src/server.js:66-70,111-127` |
| Autenticación | sesión firmada + compatibilidad `x-admin-password`; bootstrap admin opcional | `backend/src/services/auth.js`, `backend/src/server.js:81-109` |

**Implicación:** la petición menciona PostgreSQL, pero este checkout no lo usa. Las verificaciones de datos deben consultar SQLite y no se debe crear un backup/migración PostgreSQL inexistente. El modelo `node:sqlite` no es un ORM.

## Rutas de interfaz y navegabilidad

| Ruta | Módulo/vista | Estado de descubrimiento | Entrada |
|---|---|---|---|
| `/` | Shell de operaciones; vista inicial **Hoy** | NO_PROBADO | Ruta pública principal |
| `/sistema-ui` | Muestra de componentes de diseño `VistaMontanaSystemPreview` | NO_PROBADO | URL directa; no aparece enlazada |
| cualquier ruta no-API en producción | fallback al export estático | NO_PROBADO / posible 404 semántico | `backend/src/server.js:906-912` |

Las siguientes son **vistas internas de estado React**, no rutas URL: `today`, `calendar`, `cleaning`, `dashboard`, `rooms`, `airbnbReservations`, `import`, `billing`, `airbnb`. La última (`airbnb`) está implementada pero no tiene botón de navegación en el menú; se considera función oculta y se debe alcanzar mediante el punto de entrada que corresponda o añadirse enlace tras validación de producto.

## Mapa de módulos y elementos interactivos

| Módulo / vista | Elementos y acciones inventariadas | Datos/API | Tablas SQLite | Estado |
|---|---|---|---|---|
| Cabecera y sesión | menú móvil, 8 vistas visibles, clave API en `localStorage` | carga general; `/api/auth/login`, `/api/auth/me` no consumidos por UI | `users` | NO_PROBADO |
| Hoy | fecha, nueva reserva, tarjetas de ingresos/salidas/en-casa/limpieza, “ver todas” | `GET /api/today`, detalle reserva | `reservations`, `reservation_rooms`, `rooms`, `room_cleaning_status` | NO_PROBADO |
| Calendario | selector mes, anterior/siguiente/hoy, buscar habitación/reserva, filtros canal/estado/más, disponibilidad, nueva reserva, bloquear, celdas con menú contextual, barras reservas/bloqueos, panel resumen | rooms, reservations, blocks, dashboard, availability | `rooms`, `reservations`, `reservation_rooms`, `blocks`, `payments`, `attachments`, `alerts` | NO_PROBADO |
| Reserva (modal/panel) | crear/editar, selección múltiple de habitaciones, lookup cédula, campos huésped/fechas/importe/canal/controles, adjuntos pendientes; panel: remisión, llegada, pagos, comprobantes, editar/reprogramar/finalizar/cancelar/eliminar | CRUD reservations; arrival; payments; attachments; client lookup | `reservations`, `reservation_rooms`, `clients`, `payments`, `attachments`, `alerts`, `audit_events` | NO_PROBADO |
| Disponibilidad | ingreso/salida/huéspedes/tipo, buscar y crear con prellenado | `GET /api/availability` | `rooms`, `reservations`, `reservation_rooms`, `blocks` | NO_PROBADO |
| Bloqueos | crear por habitación o todo hotel, tipo/notas/fechas; editar/eliminar individual o grupo | CRUD blocks | `blocks`, `rooms` | NO_PROBADO |
| Limpieza | fecha, actualizar, filtro/segmentos/búsqueda, acciones iniciar/listo/estados, notas, exportar | `GET/PUT /api/cleaning`, CSV | `room_cleaning_status`, `room_cleaning_history`, `rooms` | NO_PROBADO |
| Dashboard | mes y rango, actualizar, exportar, filtro de canal, búsqueda, tarjetas, alertas y accesos a detalle/vista | `GET /api/dashboard`, export reservations | datos agregados de reservations/rooms/payments/blocks/alerts | NO_PROBADO |
| Habitaciones | búsqueda, estado, sincronización iCal, alta/edición/desactivar, detalles/campos/capacidad/precio/color/foto, iCal URL/activo/probar, bloquear | CRUD rooms, iCal test, sync all | `rooms`, `reservation_rooms`, `airbnb_sync_feeds`, `airbnb_listing_aliases` | NO_PROBADO |
| Airbnb sync (oculto) | elegir habitación, URL, guardar; sincronizar/pausar/activar/eliminar feed | CRUD `/api/airbnb-sync/feeds`, sync endpoints | `airbnb_sync_feeds`, `airbnb_sync_events`, `blocks`, `reservations` | NO_PROBADO |
| Reservas Airbnb | búsqueda, tarjeta/detalle, completar nombre de huésped y guardar | `GET /api/reservations` y actualización reservation | `reservations`, `clients`/`guests` potencialmente | NO_PROBADO |
| Importar y respaldos | detalles desplegables: generar/validar backups, preview/confirmar reservas, forzar alertas altas, plantilla, import rooms, import Airbnb/mapeos listing, 5 CSV, guía | backups/import/export endpoints | `backup_records`, `import_batches`, `imports`, `alerts`, entidades importadas | NO_PROBADO |
| Cuenta de cobro | rango, actualizar, incluir/excluir filas, exportar XLSX/PDF | `GET /api/billing-account`; POST exports | lectura `reservations`, `payments`, `reservation_rooms` | NO_PROBADO |
| Componentes UI | diálogo Radix, botón, badge, card, input, label, table; preview visual | sin API propia | N/A | NO_PROBADO |

## Superficie API completa (rutas de prueba)

| Dominio | Endpoints |
|---|---|
| Salud/sesión/auditoría | `GET /api/health`; `POST /api/auth/login`; `GET /api/auth/me`; `GET /api/audit`; `GET/POST /api/users` |
| Habitaciones/clientes/huéspedes | `GET/POST /api/rooms`; `PUT/DELETE /api/rooms/:id`; `POST /api/rooms/:id/airbnb-ical/test`; `GET /api/clients`; `GET/POST /api/guests`; `GET /api/guests/:id`; `POST /api/reservations/:id/guests` |
| Reservas, pagos y adjuntos | `GET/POST /api/reservations`; `GET/PUT/DELETE /api/reservations/:id`; `PUT /api/reservations/:id/arrival`; `POST/DELETE /api/reservations/:id/rooms[/ :roomId]`; `GET/POST /api/reservations/:id/payments`; `PUT/DELETE /api/payments/:id`; `POST/GET /api/reservations/:id/attachments`; `DELETE /api/attachments/:id`; `GET /uploads/:file` |
| Operación | `GET /api/availability`; `GET /api/today`; `GET/PUT /api/cleaning[/:roomId]`; `GET /api/cleaning/export.csv`; `GET/POST /api/blocks`; `PUT/DELETE /api/blocks/:id` |
| Airbnb | `GET/POST /api/airbnb-sync/feeds`; `PUT/DELETE /api/airbnb-sync/feeds/:id`; `POST .../:id/sync`, `/sync-due`, `/sync-all`, `/import-names`, `/import-preview` |
| Importación/exportación | preview/confirm Excel y rooms; template; list/detail imports; exports reservation CSV/excel, rooms CSV/XLSX, payments, balances | 
| Finanzas/indicadores | `GET /api/billing-account`; `POST /api/billing-account/export.xlsx|pdf`; `GET /api/dashboard`; `GET /api/alerts`; `PUT /api/alerts/:id/resolve` |
| Backups | El cliente declara `GET/POST /api/backups` y `POST /api/backups/:id/validate`, pero **no hay rutas `app.*("/api/backups")` en `backend/src/server.js`**. Hallazgo estático candidato P1: la UI de respaldo llamará 404 hasta que se implemente/conecte la ruta. |

## Tablas y relaciones a cubrir

| Área | Tablas |
|---|---|
| Inventario y reservas | `rooms`, `reservations`, `reservation_rooms`, `blocks` |
| Personas | `clients`, `guests`, `reservation_guests`, `guest_notes` |
| Dinero/archivo | `payments`, `attachments` |
| Integración | `airbnb_sync_feeds`, `airbnb_sync_events`, `airbnb_listing_aliases` |
| Operación/importación | `room_cleaning_status`, `room_cleaning_history`, `imports`, `import_batches`, `alerts` |
| Seguridad/recuperación | `users`, `audit_events`, `backup_records`, `schema_migrations` |

Relaciones declaradas críticas: `reservation_rooms.reserva_id -> reservations`, `reservation_rooms.habitacion_id -> rooms`; `payments.reserva_id -> reservations`; `attachments.reserva_id -> reservations`; `blocks.habitacion_id -> rooms`; y las relaciones de huéspedes, iCal y limpieza indicadas por FK en `backend/src/database/db.js`.

## Capacidades descubiertas sin interfaz visible

1. Login/token de sesión, usuarios, auditoría y huéspedes existen como API pero no aparecen en el cliente principal.
2. Restauración, eliminación/protección/descarga de backup, reintento/reversión e historial de lote no se encontraron en el cliente/API expuesta; no deben marcarse como probadas.
3. No se encontró recuperación de acceso, perfil, cierre de sesión, roles/permisos UI, gestión de alertas, página de huéspedes, ni vistas separadas de pagos/mantenimiento. Se clasifican inicialmente como `NO_EXISTE_EN_UI` (por confirmar en Chrome/API).
4. No se encontró ruta de exportación iCal saliente/token revocable; solo feed iCal entrante Airbnb y sincronización.

## Prioridad para la ejecución

Primero: acceso/autorización y backup SQLite; después reservas + disponibilidad + bloqueos + pagos (invariantes de ocupación y dinero); luego imports/exports/iCal; finalmente vistas responsivas/accesibilidad y capacidades API sin UI.

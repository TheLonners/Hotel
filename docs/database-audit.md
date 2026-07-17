# Auditoría de SQLite — 2026-07-17

## Decisión

**MANTENER SQLITE CON MEJORAS.** La instalación actual usa un único backend Node.js, un archivo local y una carga pequeña (368 reservas y una base de aproximadamente 1 MB durante esta auditoría). SQLite en WAL es adecuado para este perfil mientras se conserve una sola instancia escritora y el archivo permanezca en disco local.

| Criterio | Estado actual | Riesgo | SQLite soporta | Recomendación |
| --- | --- | --- | --- | --- |
| Instancias escritoras | Una instalación local observada | Alto si se escala horizontalmente | Sí, una instancia | Mantener una sola instancia |
| Archivo y sistema de archivos | `data/hotel.sqlite` local | Alto en red/sincronización | Sí, disco local | No usar OneDrive, Drive, Dropbox, NFS ni recursos compartidos |
| Concurrencia | Transacciones `BEGIN IMMEDIATE`, WAL y espera configurable | Medio | Sí, escritura serializada | Mantener transacciones breves y revalidar disponibilidad dentro de ellas |
| Volumen observado | 368 reservas / 66 habitaciones | Bajo | Sí | Revisar mensualmente crecimiento y planes de consulta |
| Recuperación | Snapshot API, hash, manifiesto y prueba temporal | Medio si todo queda en el mismo disco | Sí | Copia externa y prueba mensual obligatorias |
| Alta disponibilidad / PITR | No requerida ni implementada | Alto si llega a ser requerida | Limitado | Planificar PostgreSQL antes de múltiples servidores, HA o PITR |

Migrar a PostgreSQL antes de producción si se ejecutan dos o más backends sobre la misma operación, se despliega en contenedores efímeros/serverless, se usa almacenamiento compartido, se requieren réplicas/PITR o los bloqueos persisten tras estas medidas.

## Arquitectura observada

- Frontend: Next.js 15 / React 19 en `frontend/`.
- API: Express y Node.js CommonJS en `backend/src/server.js`.
- Acceso: `node:sqlite` y una conexión `DatabaseSync` de proceso en `backend/src/database/db.js`; no hay ORM ni driver PostgreSQL.
- Base operativa: `data/hotel.sqlite`; uploads y respaldos están fuera del frontend público.
- Concurrencia: `foreign_keys=ON`, WAL cuando `DATABASE_ENABLE_WAL=true`, `busy_timeout`, `synchronous=NORMAL`, `wal_autocheckpoint` y límite de journal configurables.

Las reservas directas/WhatsApp y Airbnb se conservan como flujos distintos: los bloqueos Airbnb se ignoran únicamente al crear/actualizar una reserva de origen no Airbnb, tal como implementa `validateAvailability`.

## Modelo resumido

Las entidades principales son `rooms`, `reservations`, `reservation_rooms`, `payments`, `clients`, `guests`, `reservation_guests`, `blocks`, `attachments`, `alerts`, importaciones, limpieza, auditoría, usuarios y sincronización Airbnb. Existen PK/FK para relaciones principales y cascadas donde corresponde. La migración v6 incorporó `UNIQUE(reserva_id, habitacion_id)` mediante el índice `ux_reservation_rooms_reservation_room`.

## Integridad verificada

Sobre una copia coherente y después sobre la base operativa se obtuvo:

- `PRAGMA integrity_check = ok`.
- `PRAGMA foreign_key_check`: 0 violaciones.
- 0 reservas sin habitación, asignaciones repetidas, pagos/importes negativos, saldos inconsistentes, fechas inválidas, estados desconocidos y cruces de reserva detectados.
- SQLite 3.53.1, WAL activo, esquema v6.

No se imprimieron ni copiaron datos personales durante la comprobación.

## Hallazgos y estado

| Severidad | Hallazgo | Evidencia | Estado |
| --- | --- | --- | --- |
| Alto | Las migraciones ejecutaban DDL y backfills en cada arranque, aumentando la contención entre procesos. | `backend/src/database/db.js` | Corregido: v6 retorna sin reescribir cuando ya está materializada. |
| Alto | La asignación de una habitación podía repetirse o eliminar la última habitación por rutas específicas. | `server.js`, `reservation_rooms` | Corregido: índice único y rutas transaccionales con validación. |
| Medio | La importación histórica de reservas conserva filas válidas y reporta filas fallidas; no es un lote totalmente atómico. | `services/importer.js` | Pendiente deliberado: conservar contrato actual hasta acordar un modo atómico de UX. La importación de habitaciones sí es atómica y respaldada. |
| Medio | Restricciones de montos, fechas y estados están validadas por servicio, no todas por `CHECK` de SQLite. | `services/reservations.js`, esquema existente | Pendiente: una reconstrucción de tabla para añadir `CHECK` requiere plan de migración y ventana de mantenimiento. |
| Alto | Los respaldos locales no sustituyen una copia externa ni protección contra ransomware/fallo de disco. | Política operativa | Pendiente operativo: replicar copias cifradas fuera del equipo. |
| Alto | Con `AUTH_ENABLED=false` la instalación es local sin autenticación. | `server.js`, `.env.example` | Pendiente antes de exponer la API fuera de una red local confiable. |
| Alto | `CORS_ORIGIN` acepta cualquier origen por defecto mientras la autenticación local está desactivada. | `backend/src/server.js` | Pendiente antes de exposición: activar auth, `SESSION_SECRET` aleatorio y una lista explícita de orígenes. |

## Cambios aplicados

- Migración v6 no destructiva, índice único de asignación e índice compuesto de consulta.
- PRAGMAs configurables por entorno y valores seguros para una sola instancia local.
- Validación de habitaciones repetidas desde el servicio y de agregar/quitar asignaciones desde la API dentro de transacciones.
- Comandos `db:check`, `db:backup`, `db:restore`, `db:test-restore`, `db:maintenance`, `db:concurrency` y `db:migrate`.
- Respaldo validado por API SQLite antes de la migración y otro después de aplicarla; restauración ensayada en un directorio temporal.

## Pruebas ejecutadas

- `pnpm db:check`: aprobado antes y después de v6.
- `pnpm db:migrate`: esquema v6, migraciones 1–6 registradas.
- `pnpm db:backup`: snapshot válido posterior a la migración.
- `pnpm db:test-restore`: restauración temporal, integridad y FK aprobadas.
- `pnpm --filter hotel-reservas-backend test:integrity`: aprobado.
- `pnpm db:concurrency`: 10/25/50 procesos; una creación y el resto conflictos controlados en cada grupo.

## Límites y próximo control

No se ejecutó `VACUUM`: reconstruye el archivo y puede bloquear escrituras. `db:maintenance` ejecuta `PRAGMA optimize` y opcionalmente `ANALYZE` después de un respaldo; programar `VACUUM` solo en ventana de mantenimiento tras medir espacio y duración. Revisar este informe antes de cualquier cambio de esquema o despliegue multiinstancia.

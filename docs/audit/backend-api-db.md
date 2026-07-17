# Auditoría backend / API / base de datos — 2026-07-11

## Método y límite

Revisión estática de `backend/src/server.js`, `database/db.js` y servicios, seguida de pruebas HTTP contra un servidor aislado en `127.0.0.1:3011`. Se definieron `DATABASE_PATH=tmp/audit-backend.sqlite`, `BACKUP_DIR=tmp/audit-backups` y `UPLOADS_DIR=tmp/audit-uploads`; **no se abrió ni modificó `data/hotel.sqlite`**. La base temporal pasó `PRAGMA integrity_check = ok` y `PRAGMA foreign_key_check` vacío después de las pruebas.

La persistencia real es **SQLite (`node:sqlite`/`DatabaseSync`)**, con `foreign_keys=ON`, `busy_timeout=5000`, `journal_mode=WAL` y transacciones que usan `BEGIN IMMEDIATE` (`backend/src/database/db.js:1-29`). No existe PostgreSQL, driver PostgreSQL, migración PostgreSQL ni ORM en este checkout.

## Resultado de rutas y contrato

| Área | Resultado | Evidencia |
|---|---|---|
| Health | PASS: `GET /api/health` devolvió 200 y los paths temporales configurados | ejecución HTTP aislada |
| Habitación | PASS: `POST /api/rooms` devolvió 201; `codigo_habitacion` único | ejecución HTTP; `db.js` tabla `rooms` |
| Validación de solapamiento | PASS parcial: tras una reserva persistida, una segunda superpuesta devolvió 409 | ejecución HTTP; `reservations.js:455-503` |
| Crear reserva WhatsApp | **FAIL P0**: HTTP 500, pero reserva y asignación quedaron persistidas | reproducido por HTTP y llamada de servicio |
| Pagos | **FAIL P1**: acepta monto `-1`, actualiza `abono=-1` y `saldo=200001` | `POST /api/reservations/1/payments` devolvió 201 |
| Asignaciones de habitación | **FAIL P1**: se puede duplicar la misma habitación y después borrar todas, dejando una reserva sin habitación | `POST/DELETE /api/reservations/:id/rooms` reproducidos |
| Backups API/UI | **FAIL P1**: `GET` y `POST /api/backups` devolvieron 404; no hay ruta Express aunque existen servicio y llamadas cliente | `api.ts:91-96`; ausencia de ruta en `server.js`; HTTP aislado |
| Integridad SQLite | PASS estructural, no equivale a validar reglas de negocio | `integrity_check=ok`, `foreign_key_check=[]` |

## Hallazgos y causa raíz

| ID | Sev. | Hallazgo | Causa y consecuencia | Evidencia |
|---|---|---|---|---|
| API-DB-001 | P0 | Crear reserva WhatsApp responde 500 y deja datos persistidos | `duplicateCandidates` contiene comentarios `//` dentro de la cadena SQL. SQLite falla con `near "/": syntax error`. `createReservation` confirma primero la reserva/asignaciones/pago y después crea/asocia huésped fuera de esa transacción; queda estado parcial y el cliente puede reintentar creando conflicto. | `backend/src/services/guests.js:37`; `reservations.js:628-696`; prueba temporal: POST 500, luego POST solapado 409. |
| API-DB-002 | P1 | Se aceptan pagos negativos | `asNumber` conserva el signo y ni la API ni `payments` tienen validación/CHECK para `monto > 0`. `recalculateReservationPayments` suma el negativo, aumentando saldo. | `reservations.js:794-817`; tabla `payments` en `db.js`; HTTP 201 con `monto:-1`. |
| API-DB-003 | P1 | Una reserva puede tener asignación de habitación duplicada o ninguna | No existe `UNIQUE(reserva_id,habitacion_id)`. El POST individual no rechaza la misma asignación; DELETE borra todas las coincidencias y no confirma que permanezca al menos una. | `server.js:287-305`; `db.js` tabla `reservation_rooms`; ejecución HTTP dejó `rooms: []`. |
| API-DB-004 | P1 | UI de backup no puede operar por API | `backupService` exporta crear/listar/validar y se importa en `server.js`, pero no existe `app.get/post('/api/backups...')`. El frontend sí lo consume. Las copias programadas continúan siendo internas, sin visibilidad/validación UI. | `backupService.js:25-85`; `server.js:14,941-945`; `api.ts:91-96`; HTTP 404. |
| API-DB-005 | P2 | Importación general de reservas no es atómica ni realiza backup previo | `confirmImport` crea registro y procesa filas individualmente; conserva las exitosas tras errores y no invoca `createBackup`. Contradice el requisito de transacción atómica/backup previo para importaciones. La importación de habitaciones sí hace backup previo y `db.transaction`. | `importer.js:219-289`; comparación `roomBulk.js:327-381`. |
| API-DB-006 | P2 | Autorización puede quedar abierta en instalación sin usuarios ni `ADMIN_PASSWORD` | `requireAuth` deja continuar si no hay usuarios y no se configuró `ADMIN_PASSWORD`; `SESSION_SECRET` usa un valor por defecto de desarrollo. Riesgo relevante si se expone fuera de LAN. | `server.js:81-94`; `auth.js:21`. |
| API-DB-007 | P3 | Integridad referencial no expresa reglas operativas | Las FK están activas y son correctas para referencias, pero no hay CHECK para importes no negativos/capacidad/fechas, ni UNIQUE de asignación; por ello `foreign_key_check` puede pasar con una reserva operativamente inválida. | `db.js` esquemas `reservations`, `payments`, `reservation_rooms`. |

## Transacciones y concurrencia

- Las rutas de crear/actualizar reserva llaman `validateAvailability` dentro de `BEGIN IMMEDIATE`; es una buena base frente a dos escritores SQLite concurrentes (`reservations.js:628,699`). Se debe volver a probar con dos POST simultáneos después de corregir API-DB-001.
- No hay idempotency key ni deduplicación para POST de pagos; un doble clic puede insertar dos pagos. Junto con API-DB-002 el impacto financiero aumenta.
- Los bloques de grupo usan transacciones en `server.js:439,473`.
- La importación de habitaciones crea una copia previa y ejecuta un lote transaccional; la importación de reservas no comparte esas garantías.

## Restricciones presentes y ausentes

Presentes: PK, FK, código de habitación único, usuario único sin distinción de mayúsculas, rol de usuario CHECK, `reservation_guests` único por par, y alias Airbnb único por habitación/nombre normalizado.

Ausentes a validar/corregir: importe de pago no negativo, habitación única por reserva, al menos una habitación por reserva, rangos/importe/capacidad no negativos y una restricción de no solapamiento (SQLite no la materializa; debe mantenerse con transacción + consulta correcta).

## Backups

El servicio usa `node:sqlite.backup`, valida `PRAGMA integrity_check`, genera SHA-256 y `manifest.json`, copia uploads y registra `backup_records`. Es una base útil, pero no hay endpoint HTTP para crear/listar/validar ni implementación de restauración. La copia de seguridad programada se llama al inicio tras 10 segundos y cada hora; debe probarse sin exponer los artefactos al cliente.

## Correcciones recomendadas, en orden

1. P0: retirar los comentarios no SQL de `duplicateCandidates`; incluir creación/asociación de huésped dentro de una única transacción o compensar/rollback ante cualquier error; agregar regresión HTTP que asegure 201 y cero filas al fallo.
2. P1: validar pago estrictamente positivo y añadir una barrera de datos compatible con migraciones existentes; proteger del doble envío/idempotencia.
3. P1: añadir UNIQUE de asignación y validar que DELETE no vacíe una reserva; corregir datos existentes antes de aplicar restricción.
4. P1: exponer rutas autorizadas de backup para listar/crear/validar, o retirar controles UI. No implementar restauración sin autorización y prueba en copia temporal.
5. P2: definir claramente si la importación de reservas es atómica; si lo es, backup previo + una transacción completa, con reversión comprobable.
6. P2: exigir credenciales/secretos seguros al iniciar fuera de desarrollo.

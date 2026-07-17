# Auditoría de formularios, validación y persistencia

Fecha: 2026-07-11. Alcance: revisión estática y reproducción aislada de los servicios de formularios/datos. No se modificó código de la aplicación ni la base existente.

## Dictamen de persistencia

La aplicación **no utiliza PostgreSQL**. La persistencia efectiva es SQLite local:

- `backend/src/database/db.js:3` importa `DatabaseSync` desde `node:sqlite`.
- `backend/src/database/db.js:7-15` resuelve `DATABASE_PATH` a `data/hotel.sqlite`, habilita WAL y claves foráneas.
- En el checkout existe `data/hotel.sqlite` (con archivos WAL/SHM). No hay configuración, driver, migración ni URL de PostgreSQL.

Esto bloquea cualquier criterio que exija backup/restauración o verificación en PostgreSQL. Hay transacciones SQLite (`BEGIN IMMEDIATE`, líneas 17-28), pero no existe una capa de compatibilidad/migración PostgreSQL.

## Inventario funcional de formularios y persistencia

| Área | UI / endpoint | Datos y validación observada | Estado |
|---|---|---|---|
| Reserva | Modal `ReservationModal`; `POST/PUT /api/reservations` | Habitación, huésped, fechas, noches, importe, anticipo, canal, adjuntos. Backend valida habitación, nombre, fecha/solape. | INCONSISTENTE |
| Pago | Panel de detalle; `POST /api/reservations/:id/payments`, `PUT/DELETE /api/payments/:id` | Monto, fecha, medio, referencia, nota; recalcula saldo. | FUNCIONA_PARCIALMENTE |
| Huésped / acompañante | `POST /api/guests`, `POST /api/reservations/:id/guests` | Nombre y detección de duplicados por documento/teléfono/email. | NO_FUNCIONA |
| Habitación | Modal de habitación; `POST/PUT /api/rooms` | Código, nombre, capacidad, camas, precio, estado, Airbnb/iCal. | FUNCIONA_PARCIALMENTE |
| Bloqueo | `BlockModal`; `POST/PUT/DELETE /api/blocks` | Habitación(es), intervalo, tipo, motivo, notas. Verifica solape. | FUNCIONA_PARCIALMENTE |
| Limpieza | `PUT /api/cleaning/:roomId` | Estado, prioridad, notas, fecha. | PENDIENTE_PRUEBA_NAVEGADOR |
| Importación reservas | XLS/XLSX/CSV preview/confirm | Sesión en memoria, alertas y creación fila a fila. | INCONSISTENTE |
| Importación habitaciones | XLS/XLSX/CSV preview/confirm | Preview y backup previo; modo atómico o filas válidas. | FUNCIONA_PARCIALMENTE |
| Comprobantes | `POST /api/reservations/:id/attachments` | Imagen/PDF, límite 15 MB, metadatos y archivo local. | PENDIENTE_PRUEBA_NAVEGADOR |

## Hallazgos

### FD-01 — P1: crear reserva WhatsApp falla después de persistirla

**Evidencia y reproducción.** Con `DATABASE_PATH=data/audit-temp.sqlite` se creó una habitación válida y se llamó a `createReservation` para una reserva WhatsApp. El resultado fue `ERR_INVALID_STATE: Unknown named parameter 'first_name'`. A continuación, `SELECT` devolvió una reserva ya insertada: `[{"id":1,"nombre_completo_huesped":"Audit Guest","cantidad_huespedes":-2,"total_pago":100,"abono":200,"saldo":0}]`.

**Causa raíz.** `duplicateCandidates` usa cuatro placeholders más `excludeId`, pero le pasa todo `guestPayload` (`backend/src/services/guests.js:36-45`). En Node 24 `node:sqlite` rechaza los parámetros nombrados extra. `createReservation` confirma su transacción en la línea 671 y solo después crea/asocia el huésped en líneas 672-685 (`backend/src/services/reservations.js`). Por ello un error de huésped devuelve error al usuario tras haber creado la reserva, sus asignaciones y posiblemente el pago inicial.

**Corrección propuesta.** Pasar a `duplicateCandidates` un objeto con únicamente `document_number`, `document_type`, `phone_normalized`, `email` y `excludeId`. Tras ello, incluir creación/asociación del huésped dentro de la misma transacción de reserva (o implementar compensación fiable). Añadir prueba de integración para éxito, fallo de duplicados y rollback total.

### FD-02 — P1: pagos negativos o superiores al total son persistibles

`addPayment` y `updatePayment` convierten el monto con `asNumber` pero no imponen mínimo, máximo, moneda/precisión ni estado de reserva (`backend/src/services/reservations.js:794-835`). La UI de pago usa un `<input>` de texto sin mínimo (`frontend/src/App.tsx:982`). El saldo se recorta a cero al recalcular, ocultando un sobrepago; un valor negativo reduce pagos acumulados.

**Corrección propuesta.** Validar en backend importe finito, positivo, a dos decimales y no superior al saldo salvo flujo explícito de devolución/corrección con tipo/auditoría. Usar `type=number`, `min`, `step=0.01`, errores junto al campo y deshabilitar doble envío. Crear pruebas de negativo, cero, sobrepago, doble clic y devolución autorizada.

### FD-03 — P2: reglas económicas y cuantitativas insuficientes en reserva/habitación

El backend acepta `cantidad_huespedes` negativa, `valor_base`/`total_pago`/`abono` negativos o incoherentes y capacidad/estado de habitación arbitrarios. `asInteger` y `asNumber` solo convierten valores (`backend/src/services/reservations.js:6-41`); la carga de reserva no impone límites (`:540-611`) y la habitación persiste `capacidad`, `precio_base_noche` y `estado` sin catálogo/intervalo (`:228-368`). La UI tampoco añade `min`, `max` o `step` en esos campos (`frontend/src/App.tsx:1229-1265`).

**Corrección propuesta.** Esquema de validación de dominio compartido o backend: huéspedes entero >=1, capacidad >=1, camas >=0, importes >=0, total/anticipo consistentes, estados/canales enumerados y límites de longitud. La UI debe reflejar dichas reglas, pero el backend es la fuente de verdad.

### FD-04 — P2: importación normal de reservas no es atómica ni crea backup previo

`confirmImport` inserta el registro de importación y procesa cada fila de forma independiente (`backend/src/services/importer.js:219-289`): ante error continúa, marca completada y conserva lo previamente creado. No llama a `createBackup` ni hay transacción de lote; en contraste, la importación de habitaciones sí crea backup y usa transacción (`backend/src/services/roomBulk.js:327-381`).

**Corrección propuesta.** Crear backup previo y `import_batches` para reservas, ejecutar modo predeterminado atómico, ofrecer explícitamente `valid_only` como operación parcial, y guardar/permitir revertir lote. Probar archivo con una fila válida seguida de otra inválida y verificar que el modo atómico no persiste nada.

### FD-05 — P2: `reservation_rooms` no impide duplicar la misma habitación en una reserva

El esquema no define `UNIQUE(reserva_id, habitacion_id)` para `reservation_rooms` (`backend/src/database/db.js:319-328`). El endpoint de agregar habitación realiza `INSERT` directo sin comprobar si ya está asociada (`backend/src/server.js:287-299`). Esto permite duplicar la fila y distorsionar calendario, totales y vistas.

**Corrección propuesta.** Migración que deduplique preservando la primera asignación, seguido de índice único compuesto; endpoint idempotente o 409 claro y prueba de llamada repetida.

### FD-06 — P3: el uso de `required` no valida porque los modales no usan `<form>` ni submit nativo

El componente `Field` imprime `required` (`frontend/src/App.tsx:1327-1333`), pero `ReservationModal` es un `section` y guarda mediante `onClick={submit}` (`:1166`, `:1318-1323`). Por tanto el navegador no bloquea los campos requeridos ni anuncia su error; se depende de mensajes generales del backend.

**Corrección propuesta.** Convertir a `<form noValidate>` con validación explícita por campo y `onSubmit`, o usar validación nativa correctamente; ligar `aria-describedby`, error junto al control y foco al primer error.

## Controles que sí existen

- Fechas de reserva inválidas, misma fecha fuera de `day_use/manual`, ausencia de habitación/nombre y solapes se validan en servicio (`backend/src/services/reservations.js:428-508, 613-671`).
- Alta/actualización de reserva está envuelta en `BEGIN IMMEDIATE`; reduce la carrera entre dos creaciones concurrentes dentro de esta única base SQLite.
- iCal exige URL HTTP(S) con ruta `.ics`/`ical` (`backend/src/services/reservations.js:148-170`).
- Adjuntos restringen MIME declarado a PNG/JPEG/WebP/PDF y 15 MB (`backend/src/server.js:121-145`); esto requiere retest de contenido real.

## Casos de regresión requeridos

Ver filas `FD-*` de `docs/audit/test-matrix.csv`. Todos requieren ejecución en Chrome, inspección de red y consulta SQLite; no puede registrarse PostgreSQL porque no existe en este checkout.

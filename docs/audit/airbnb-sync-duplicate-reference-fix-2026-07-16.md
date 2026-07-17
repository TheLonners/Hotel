# Corrección de identidad en sincronización Airbnb

- Fecha: 2026-07-16
- Fase: corrección compatible de reservas/sincronización
- Problema: un evento iCal que cambiaba de UID podía intentar crear o actualizar una segunda reserva para el mismo código de confirmación de Airbnb. La validación de disponibilidad detectaba entonces un cruce con la reserva ya existente.
- Archivos: `backend/src/services/airbnbSync.js`, `backend/src/scripts/verify-reservation-integrity.js`.
- Decisión: antes de sincronizar una reserva, buscar por habitación, origen `airbnb` y `numero_remision` (código de confirmación). Esa referencia es estable para una misma reserva aunque el UID iCal cambie.
- Alternativa descartada: ignorar cualquier cruce por nombre o fechas. Podría ocultar dos reservas reales distintas y comprometer la disponibilidad.
- Riesgo: limitado a reservas Airbnb con el mismo código de confirmación dentro de una misma habitación; esas entradas representan la misma reserva y se actualizan en lugar de duplicarse.
- Validación: `node --check backend/src/services/airbnbSync.js` y `pnpm --filter hotel-reservas-backend test:integrity`.
- Pendiente: al ejecutar la próxima sincronización, el mapeo del evento se actualizará automáticamente a la reserva reutilizada.

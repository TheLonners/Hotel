# Registro de cambios de base de datos

## 2026-07-17 — estabilización SQLite

**Fase:** auditoría, integridad, concurrencia y recuperación.

**Archivos modificados:** `backend/src/database/db.js`, `backend/src/services/reservations.js`, `backend/src/server.js`, `backend/src/services/backupService.js`, scripts operativos en `backend/src/scripts/`, `package.json`, `backend/package.json`, `backend/.env.example` y esta documentación.

**Decisiones:**

- Se mantiene SQLite con WAL para una única instancia local.
- Se creó migración no destructiva v6: índice único para una habitación por reserva y retorno temprano tras materializar esquema, para no reejecutar backfills al iniciar.
- No se reescribieron reservas, pagos, habitaciones ni datos de huéspedes. La migración se precedió por un snapshot verificado y se creó otro respaldo posterior.
- Se protegieron las rutas de agregar/quitar habitación para conservar una asignación mínima y evitar duplicados.
- La restauración requiere confirmación y señal explícita de que la aplicación está detenida.

**Riesgo mitigado:** duplicación de asignaciones, reserva sin habitación, contención por migraciones repetidas, ausencia de chequeos operativos y recuperación manual insegura.

**Validaciones:**

```powershell
pnpm db:check
pnpm db:migrate
pnpm db:backup
pnpm db:test-restore
pnpm --filter hotel-reservas-backend test:integrity
pnpm db:concurrency
```

Todas aprobaron durante esta fase. Pendientes: acuerdo de UX para hacer la importación histórica completamente atómica, incorporar `CHECK` de dominio mediante una migración con reconstrucción de tabla y configurar copia cifrada externa / autenticación antes de una exposición de red.

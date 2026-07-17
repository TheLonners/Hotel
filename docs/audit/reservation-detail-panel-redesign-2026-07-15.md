# Rediseño del panel lateral de reservas

- Fecha: 2026-07-15
- Fase: 6 - Responsive y accesibilidad
- Problema: el panel lateral de escritorio no correspondía con la nueva composición visual solicitada y mostraba bloques financieros, detalles, pagos y comprobantes sin una jerarquía consistente.
- Archivos: `frontend/src/App.tsx`, `frontend/src/styles/app.css`.

## Decisión

Se reorganizó el mismo flujo de reserva en un panel amplio de escritorio con encabezado, resumen financiero, remisión, detalles en dos columnas, estado de sincronización Airbnb, pagos, comprobantes y acciones fijas al pie. Las llamadas existentes para actualizar remisión, registrar o eliminar pagos, adjuntar comprobantes, editar, reprogramar, finalizar, cancelar y eliminar se preservaron.

También se ajustó el calendario: el botón Hoy quedó entre los controles de mes, Resumen permanece visible al alternar el lateral y los buscadores de habitación y huésped comparten un ancho útil de escritorio.

## Alternativas descartadas

- Reemplazar el panel por una página nueva: descartado para no cambiar navegación ni contratos de datos.
- Eliminar controles de pago o comprobantes para coincidir visualmente: descartado porque afectaría funcionalidades operativas.

## Riesgo y validación

- Riesgo para reservas/calendario/CSV/SQLite: bajo; no se modificaron rutas API, modelos, SQL ni datos.
- Validaciones: `pnpm.cmd typecheck`, `pnpm.cmd build` y `git diff --check` correctos.
- Verificación visual: calendario de escritorio comprobado; el panel conserva las acciones existentes y su composición se compila correctamente.

# Calendario: desplazamiento continuo y fecha local

- Fecha: 2026-07-16
- Fase: responsive y experiencia de calendario.
- Problema: el calendario mostraba una ventana fija hasta el 28 de octubre y un área vacía adicional provocada por bloqueos fuera del rango visible. Además, la fecha actual se derivaba de UTC y podía adelantarse un día en Colombia.
- Archivos: `frontend/src/App.tsx`, `frontend/src/lib/hotel-utils.ts`.
- Decisión: al acercarse a cualquiera de los bordes horizontales, mover la ventana un mes y mantener anclado el día que estaba visible. Los bloques y reservas totalmente fuera de la ventana no se renderizan ni expanden el grid.
- Fecha: la fecha de operación se calcula explícitamente en `America/Bogota`; los cálculos de rangos siguen utilizando UTC para preservar la semántica de los valores `YYYY-MM-DD`.
- Riesgo: los datos del nuevo tramo se vuelven a consultar por mes; la ventana anterior se mantiene solapada para evitar saltos visuales.
- Validación: `pnpm typecheck`, `pnpm build` y prueba manual en navegador al avanzar de julio a agosto y regresar a julio; la carga inicial quedó centrada en el 16 de julio.

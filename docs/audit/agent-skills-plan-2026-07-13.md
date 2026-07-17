# Plan de mejora por fases — 2026-07-13

Este plan deriva de `agent-skills-audit-2026-07-13.md`. Cada fase debe producir un diff acotado, ejecutar las validaciones existentes y conservar reservas, calendario, CSV, dashboard, SQLite y la separación Airbnb/WhatsApp.

## Fases y puertas de salida

| Fase | Skill | Alcance | Puerta de salida |
|---|---|---|---|
| 1 | `webapp-audit` | Diagnóstico sin cambios de app | Reporte con evidencia, prioridades y riesgos. Cumplida. |
| 2 | Plan | Orden, dependencias, rollback y criterios | Este documento aprobado como guía operativa. Cumplida. |
| 3 | `dead-code-cleanup` | Candidatos y eliminación de bajo riesgo | Candidatos listados; solo se eliminan usos comprobados; typecheck/build pasan. |
| 4 | `safe-refactor` | Extraer dominios de `App.tsx`, duplicación y contratos | Un lote por vez, flujo visible preservado, build e integridad pasan. |
| 5 | `nextjs-performance-audit` | Cargas, imports, imágenes, re-renderizados y bundle | Evidencia antes/después; no cambian resultados ni disponibilidad. |
| 6 | `accessibility-responsive-audit` | Navegación, tablas, calendario, formularios, focus y móvil | Pruebas desktop/móvil y typecheck/build; no se pierde ninguna acción crítica. |
| 7 | `security-audit` | Roles, sesión, inputs, uploads, CORS y errores | Matriz de autorización y pruebas de negativos; sin secretos reales ni cambios de datos. |
| 8 | `e2e-testing-playwright` | Flujos críticos y viewport móvil | Suite aislada y reproducible; Playwright instalado/configurado solo si se autoriza. |

## Orden de ejecución dentro de cada fase

1. Revisar el estado actual y el diff.
2. Declarar invariantes y archivos del lote.
3. Crear backup antes de cualquier operación de datos o migración.
4. Aplicar el cambio mínimo.
5. Ejecutar `pnpm typecheck` y/o `pnpm build`; para backend/datos usar `pnpm --filter hotel-reservas-backend test:integrity`.
6. Probar el flujo afectado y revisar el diff.
7. Registrar resultado, riesgos y pendientes.

## Invariantes no negociables

- Airbnb y WhatsApp/directas conservan sus propios filtros, nombres y reglas de disponibilidad.
- Bloqueos Airbnb no se convierten en bloqueos manuales/eventos.
- El calendario mantiene fechas, orden, selección, creación y edición.
- La importación mantiene preview, alertas, confirmación y formatos de columnas.
- SQLite no se resetea ni se borra; los cambios de esquema requieren migración explícita.
- Los archivos `.env` reales, credenciales, backups, uploads y datos personales no entran en el diff.

## Rollback

Cada lote debe poder revertirse con su diff aislado. Si el problema es de datos, detenerse, conservar el backup y ejecutar primero las verificaciones de integridad; no reparar a ciegas.

# Candidatos de dead code — 2026-07-13

## Método

Se revisaron imports y referencias con `rg`, se comprobó la ruta dinámica `/sistema-ui` y se ejecutó TypeScript con `--noUnusedLocals --noUnusedParameters`. Los candidatos de esta lista no tienen consumidores en `frontend/src` ni en la configuración revisada.

## Candidatos aprobados para eliminación segura

| Candidato | Evidencia | Riesgo | Acción |
|---|---|---|---|
| `Landmark`, `Mail`, `MapPin` | TypeScript TS6133; solo declarados en el import de `App.tsx`. | Bajo | Eliminar del import. |
| `OperationList` | Declaración en `App.tsx:2123`; sin referencias adicionales. | Bajo | Eliminar helper no usado. |
| `cleaningStates` | Declaración en `App.tsx:2145`; sin referencias adicionales. | Bajo | Eliminar constante no usada. |
| `MobileCleaningHome` | Declaración en `App.tsx:2603`; no usada; `MobileCleaningHomeReference` es otro componente y sí se consume. | Bajo | Eliminar componente antiguo no usado. |
| `ChartBarList` | Declaración en `App.tsx:3168`; sin referencias adicionales. | Bajo | Eliminar helper no usado. |
| `DashboardBreakdown` | Declaración en `App.tsx:3187`; sin referencias adicionales. | Bajo | Eliminar helper no usado. |
| `DashboardList` | Declaración en `App.tsx:3202`; sin referencias adicionales. | Bajo | Eliminar helper no usado. |

## Candidatos pendientes

- `frontend/src/components/vm/interface-system.tsx` y `frontend/src/components/ui/*`: se usan desde `/sistema-ui`; no eliminar.
- Dependencias Radix/Tailwind: se usan en los componentes de sistema UI o configuración; requieren análisis de dependency graph antes de tocar manifests.
- Estilos CSS sin uso: no se eliminan por nombre porque hay clases dinámicas y múltiples vistas en un solo módulo.
- Servicios backend con pocos imports directos: son entrypoints de `server.js` y no son dead code.

## Validación requerida tras la eliminación

`pnpm typecheck`, `pnpm build`, `pnpm --filter hotel-reservas-backend test:integrity` y revisión de `git diff --check`.

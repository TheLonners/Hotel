---
name: webapp-audit
description: Auditar una aplicación hotelera Next.js, Express y SQLite antes de modificar código, cubriendo arquitectura, flujos de reservas, calendario, dashboard, CSV, responsive, rendimiento, seguridad, accesibilidad y deuda técnica.
---

# Auditoría integral de la app web

## Descripción

Inspeccionar la aplicación completa y producir evidencia antes de tocar código de aplicación. La auditoría debe comprender el flujo real de UI a API y base de datos.

## Cuándo usarla

- Al iniciar una mejora amplia del proyecto.
- Antes de refactorizar reservas, calendario, dashboard o carga CSV.
- Cuando no esté claro dónde vive una regla de negocio o qué archivos siguen activos.

## Objetivo

Entregar un diagnóstico priorizado, reproducible y sin modificaciones iniciales: estado actual, problemas, archivos, impacto, recomendación y plan por fases.

## Pasos de trabajo

1. Leer `AGENTS.md`, `README.md`, ambos `package.json`, configuración Next/TypeScript y documentación en `docs/audit/`.
2. Inventariar carpetas, rutas Next, componentes, hooks, servicios, API, modelos/acceso SQLite y scripts.
3. Trazar los flujos de login, dashboard, reservas, calendario, habitaciones, formularios, CSV y configuración.
4. Separar explícitamente reservas Airbnb, WhatsApp/directas, bloqueos manuales y eventos; localizar disponibilidad y conflictos.
5. Revisar responsive móvil/escritorio, accesibilidad, rendimiento, seguridad, duplicación y archivos posiblemente muertos.
6. Leer los archivos críticos y sus consumidores; no concluir por nombres de archivos solamente.
7. Revisar scripts realmente declarados y ejecutar solo validaciones no destructivas disponibles.
8. Clasificar cada hallazgo como alta/media/baja con evidencia, impacto y recomendación.
9. Proponer fases ordenadas, dependencias y criterios de salida sin aplicar cambios de código.

## Reglas importantes

- No modificar código de aplicación durante la primera pasada.
- No leer ni imprimir secretos de `.env`, datos personales, tokens ni contenido sensible de SQLite.
- No escribir en SQLite ni ejecutar seed/importaciones.
- No marcar dead code sin revisar imports estáticos, dinámicos, rutas y configuración.
- Tratar `data/hotel.sqlite` como fuente operativa y preservar las reglas Airbnb vs WhatsApp.
- Distinguir hechos verificados, hipótesis y elementos no comprobables sin servidor/browser.

## Comandos sugeridos

Primero confirmar `package.json`; para este repositorio son válidos `pnpm typecheck`, `pnpm build` y `pnpm --filter hotel-reservas-backend test:integrity` cuando correspondan. Usar `rg --files`, `rg` y `git diff --check` para inspección. No inventar `lint` o `test` porque no están definidos actualmente.

## Formato de salida

Entregar:

- resumen del estado actual;
- mapa de arquitectura y flujos;
- tabla `prioridad | hallazgo | evidencia/archivo | impacto | recomendación`;
- riesgos no verificados;
- plan de refactor por fases con criterios de salida;
- comandos ejecutados y resultados.

## Checklist final

- [ ] Se revisaron frontend, backend, SQLite, dashboard, calendario y CSV.
- [ ] Se revisaron responsive, rendimiento, seguridad y accesibilidad.
- [ ] Se distinguieron Airbnb y WhatsApp/directas.
- [ ] No se modificó código de aplicación en la primera pasada.
- [ ] Cada hallazgo tiene evidencia y prioridad.
- [ ] El plan incluye validación y rollback.

---
name: safe-refactor
description: Controlar refactors grandes de la app hotelera mediante fases pequeñas, contratos preservados, cambios reversibles y validaciones después de cada lote.
---

# Refactor seguro

## Descripción

Servir como guardrail para reorganizar código problemático sin romper comportamiento existente, datos SQLite, calendario, dashboard, CSV ni separación Airbnb/WhatsApp.

## Cuándo usarla

- Cuando el cambio atraviese varios componentes, servicios o capas.
- Para extraer componentes, separar lógica duplicada o reorganizar carpetas.
- Antes de modificar formularios, calendario, dashboard o importación.

## Objetivo

Lograr una estructura más mantenible con lotes pequeños, evidencia de equivalencia y un camino claro de rollback.

## Pasos de trabajo

1. Entender el comportamiento actual: entrypoints, consumidores, API, estado, SQL, errores y flujos UI.
2. Escribir alcance, invariantes, archivos candidatos, riesgo y plan de lotes.
3. Capturar baseline con typecheck/build/integridad y pruebas manuales o E2E disponibles.
4. Hacer un solo tipo de cambio por lote: extracción, renombrado, deduplicación o movimiento.
5. Mantener APIs, formatos, estados, fechas, permisos y mensajes compatibles.
6. Validar inmediatamente cada lote; si falla, corregirlo o revertirlo antes de seguir.
7. Revisar diff, imports, rutas dinámicas y archivos generados.
8. Documentar qué cambió, por qué, qué no se cambió y el plan siguiente.

## Reglas importantes

- No refactorizar toda la app de golpe.
- Antes de modificar, entender la funcionalidad actual.
- Mantener comportamiento existente y no cambiar modelos de datos sin migración.
- No romper SQLite: backup antes de escrituras, consultas parametrizadas e integridad después.
- No cambiar diseño global sin justificar.
- No borrar lógica sin evidencia.
- No mezclar reservas Airbnb con WhatsApp/directas.
- Hacer cambios pequeños y verificables; ante una falla, detener el avance de fase.

## Comandos sugeridos

Revisar scripts primero. En este repo usar `pnpm typecheck`, `pnpm build`, `pnpm --filter hotel-reservas-backend test:integrity`, `pnpm backup`, `pnpm dev:backend` y `pnpm dev:frontend` según el lote. No inventar `lint` o `test`.

## Formato de salida

Entregar plan de lote, invariantes, archivos, diff resumido, validaciones antes/después, riesgos, rollback y decisiones documentadas.

## Checklist final

- [ ] El comportamiento actual fue entendido y quedó descrito.
- [ ] El refactor fue dividido en lotes pequeños.
- [ ] SQLite y contratos de reserva se preservaron.
- [ ] Cada lote tiene validaciones y rollback.
- [ ] Se documentaron decisiones, pendientes y fallas.

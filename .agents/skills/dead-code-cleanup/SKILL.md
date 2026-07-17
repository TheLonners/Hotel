---
name: dead-code-cleanup
description: Detectar y eliminar código muerto de forma segura en la app hotelera, con candidatos revisados, evidencia de no uso y validaciones antes y después.
---

# Limpieza de código muerto

## Descripción

Encontrar imports, variables, funciones, componentes, hooks, dependencias, exports, estilos, rutas y carpetas sin uso comprobable, y eliminar solo lo seguro.

## Cuándo usarla

- Después de la auditoría general y antes de refactors estructurales.
- Cuando existan duplicados, archivos antiguos o warnings de compilación.
- Cuando una dependencia o export parezca huérfano.

## Objetivo

Reducir ruido y superficie de mantenimiento sin cambiar lógica de negocio, contratos API, reservas, calendario, CSV ni datos.

## Pasos de trabajo

1. Leer `package.json` y localizar entrypoints, rutas, alias y configuración.
2. Buscar imports/exports y usos con `rg`; revisar imports dinámicos, `next` routes, configuración, scripts y nombres construidos.
3. Generar una lista de candidatos antes de borrar: archivo/símbolo, evidencia, riesgo y prueba necesaria.
4. Presentar la lista y, si el flujo permite cambios, eliminar solo candidatos de bajo riesgo aprobados por evidencia local.
5. Limpiar imports/variables realmente no usados sin cambiar expresiones con efectos secundarios.
6. Revisar estilos y carpetas antiguas solo después de comprobar que no son referenciados por clases dinámicas o runtime.
7. Ejecutar typecheck/build y la integridad SQLite cuando el área lo requiera.
8. Revisar diff y documentar lo que se dejó pendiente por incertidumbre.

## Reglas importantes

- No eliminar archivos sin comprobar importaciones y rutas.
- No eliminar lógica de negocio, handlers, loaders o componentes que puedan usarse dinámicamente sin evidencia adicional.
- No eliminar archivos de `data/`, `backups/`, `uploads/`, builds o documentación histórica.
- No tocar `.env` ni datos reales.
- Si un candidato impacta reservas Airbnb/WhatsApp, calendario o CSV, dejarlo pendiente salvo prueba de regresión.
- Si falla una validación, corregir o revertir el lote antes de continuar.

## Comandos sugeridos

Revisar primero los `package.json`. En este proyecto usar `rg --files`, `rg`, `pnpm typecheck`, `pnpm build` y `pnpm --filter hotel-reservas-backend test:integrity` según el alcance. No ejecutar `pnpm lint` o `pnpm test` porque no existen actualmente.

## Formato de salida

Entregar primero la tabla de candidatos. Después de la limpieza: archivos eliminados/modificados, evidencia de no uso, riesgos, validaciones, resultados y pendientes.

## Checklist final

- [ ] Se entregaron candidatos antes de borrar.
- [ ] Se revisaron usos estáticos, dinámicos y rutas.
- [ ] No se eliminó lógica de negocio ni datos.
- [ ] Se ejecutaron las validaciones disponibles.
- [ ] El diff es pequeño, explicable y reversible.

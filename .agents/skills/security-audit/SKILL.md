---
name: security-audit
description: Auditar seguridad de una app hotelera Express, Next.js y SQLite, cubriendo auth, roles, rutas, inputs, CSV, sesiones, secretos, errores, dependencias y operaciones destructivas sin explotar vulnerabilidades.
---

# Auditoría de seguridad

## Descripción

Revisar controles y flujos de seguridad con evidencia de código/configuración, priorizando correcciones seguras y sin acceder o modificar secretos ni datos reales.

## Cuándo usarla

- Antes de exponer la app en LAN o producción.
- Cuando se cambie autenticación, autorización, API, CSV o SQLite.
- Para revisar permisos de administrador y operaciones destructivas.

## Objetivo

Entregar hallazgos reproducibles con evidencia y solución, y aplicar únicamente correcciones de bajo riesgo aprobadas por el flujo de trabajo.

## Pasos de trabajo

1. Leer `AGENTS.md`, package manifests y configuración sin imprimir valores secretos.
2. Trazar login, cookies/sesiones, auth middleware, roles, protección de rutas y permisos por operación.
3. Revisar validación de inputs, SQL parametrizado, formularios, errores, CORS, uploads CSV, tamaño/tipo de archivo y path handling.
4. Buscar exposición de secretos, PII, stacks, datos de SQLite y endpoints administrativos.
5. Revisar dependencias con herramientas disponibles y distinguir vulnerabilidad confirmada de sospecha.
6. Revisar reservas, Airbnb/WhatsApp, calendario, import/export y operaciones destructivas por autorización y consistencia.
7. Clasificar severidad, evidencia, impacto, precondiciones y remediación.
8. Aplicar solo cambios acotados y validar typecheck/build/integridad si corresponde.

## Reglas importantes

- No explotar vulnerabilidades ni ejecutar payloads destructivos.
- No imprimir secretos, credenciales, tokens, `.env`, PII o datos completos de SQLite.
- No modificar credenciales reales, variables de entorno reales ni eliminar datos.
- No debilitar auth solo para que una prueba pase.
- No cambiar autorización o disponibilidad sin probar los roles y las fuentes Airbnb/WhatsApp.
- Reportar ruta/archivo/línea y evidencia mínima redactada.

## Comandos sugeridos

Confirmar scripts antes de ejecutar. En este repo: `pnpm typecheck`, `pnpm build`, `pnpm --filter hotel-reservas-backend test:integrity` y `pnpm backup` cuando sea necesario. No hay `lint`, `test` ni auditoría de dependencias definida en los manifests actuales.

## Formato de salida

Tabla `severidad | hallazgo | evidencia | impacto | corrección recomendada | estado`, separando corregido, pendiente, falso positivo y no verificable.

## Checklist final

- [ ] Se revisaron auth, roles, rutas, inputs, CSV, SQLite y operaciones destructivas.
- [ ] No se expusieron secretos ni datos personales.
- [ ] Cada hallazgo tiene evidencia y severidad.
- [ ] Las correcciones no debilitan controles existentes.
- [ ] Validaciones ejecutadas y limitaciones documentadas.

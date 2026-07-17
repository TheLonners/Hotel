---
name: e2e-testing-playwright
description: Crear o mejorar pruebas end-to-end con Playwright para los flujos críticos de la app hotelera, usando selectores estables y cobertura desktop/móvil.
---

# Pruebas end-to-end con Playwright

## Descripción

Diseñar pruebas de flujo completo desde la UI hasta API/SQLite para detectar regresiones en reservas, calendario, dashboard, CSV y canales Airbnb/WhatsApp.

## Cuándo usarla

- Antes y después de refactors de alto riesgo.
- Cuando se agregue una ruta crítica o se corrija una regresión visible.
- Para validar desktop y viewport móvil.

## Objetivo

Construir una suite pequeña, estable y representativa que proteja comportamiento crítico sin depender de datos frágiles o secretos reales.

## Pasos de trabajo

1. Revisar `package.json` y confirmar si Playwright está instalado; actualmente no hay script Playwright declarado.
2. Proponer instalación/configuración solo si el usuario autoriza agregar dependencia y archivos de configuración.
3. Definir fixtures/datos aislados y estrategia de servidor; nunca usar la base operativa sin backup y aprobación explícita.
4. Crear escenarios para login, navegación, dashboard, crear/editar reserva, bloquear/liberar habitación, calendario, CSV, Airbnb y WhatsApp.
5. Añadir una prueba móvil con viewport definido y esperar estados observables, no tiempos arbitrarios.
6. Usar roles, labels, textos de negocio estables o `data-testid` cuando sea necesario; evitar selectores CSS frágiles.
7. Ejecutar pruebas focalizadas antes y suite completa después de cada lote.
8. Reportar flakiness, cobertura y cualquier flujo no verificable por falta de entorno.

## Reglas importantes

- No crear pruebas que muten la SQLite operativa ni usen credenciales reales.
- No ocultar errores con retries excesivos, sleeps o aserciones débiles.
- No mezclar reservas Airbnb con WhatsApp en fixtures o expectativas.
- No cambiar producto para acomodar una prueba sin documentar la razón.
- Si Playwright no está instalado, proponer instalación; no simular que existe.

## Comandos sugeridos

Primero revisar `package.json`. En el repo actual usar `pnpm dev:backend`, `pnpm dev:frontend`, `pnpm typecheck`, `pnpm build` y `pnpm --filter hotel-reservas-backend test:integrity`. Ejecutar comandos Playwright solo después de confirmar que están instalados y definidos.

## Formato de salida

Entregar matriz `flujo | spec | datos aislados | viewport | resultado | evidencia | pendientes`, más comando exacto y causa de cada fallo.

## Checklist final

- [ ] Se comprobó la instalación/configuración real de Playwright.
- [ ] Se cubrieron flujos críticos y móvil.
- [ ] Se usaron selectores estables y esperas observables.
- [ ] No se mutó la base operativa.
- [ ] Resultados y límites de cobertura están documentados.

---
name: lighthouse-web-vitals-audit
description: Preparar o ejecutar una auditoría tipo Lighthouse de la app hotelera para LCP, CLS, TBT, accesibilidad, buenas prácticas, SEO y carga móvil/escritorio.
---

# Auditoría Lighthouse y Web Vitals

## Descripción

Evaluar rendimiento percibido y calidad de rutas con evidencia de Lighthouse o una inspección equivalente cuando la herramienta no esté instalada.

## Cuándo usarla

- Para comparar calidad móvil y escritorio antes/después de cambios.
- Cuando se reporten cargas lentas, saltos visuales o problemas de accesibilidad.
- Antes de cerrar una fase de rendimiento o responsive.

## Objetivo

Entregar una tabla accionable por ruta con métrica afectada, causa, archivo, solución y prioridad.

## Pasos de trabajo

1. Revisar `package.json` y confirmar si existe servidor, Playwright, Lighthouse o herramienta equivalente.
2. Levantar el frontend usando únicamente scripts reales y comprobar que el backend requerido está disponible.
3. Revisar como mínimo home/login, dashboard, reservas, calendario, habitaciones, formularios, CSV y configuración si existe.
4. Medir en móvil y escritorio cuando sea posible; registrar URL, viewport, fecha, modo y limitaciones.
5. Analizar LCP, CLS, TBT y rendimiento general, además de accesibilidad, buenas prácticas y SEO básico.
6. Relacionar cada hallazgo con archivo o componente sin atribuir causas no verificadas como hechos.
7. Aplicar solo correcciones seguras dentro de la fase autorizada; volver a medir las rutas afectadas.

## Reglas importantes

- No inventar métricas si no se pudo ejecutar Lighthouse.
- No exponer URLs con tokens, datos personales o credenciales.
- No cambiar textos, rutas o flujo de login solo para mejorar SEO.
- No usar mediciones de un build distinto al que se reporta.
- Si no existe script para la herramienta, documentar la ausencia y entregar auditoría estática/plan de ejecución.

## Comandos sugeridos

Primero revisar `package.json`. En este proyecto usar `pnpm dev:frontend`, `pnpm build` y `pnpm typecheck`; no hay script Lighthouse declarado. Verificar disponibilidad de una herramienta antes de ejecutar un comando adicional.

## Formato de salida

Tabla obligatoria:

`ruta | problema | métrica afectada | causa probable | archivo relacionado | solución recomendada | prioridad`.

Incluir método, entorno, comandos, resultados y limitaciones.

## Checklist final

- [ ] Se revisaron las rutas mínimas disponibles.
- [ ] Se separaron móvil y escritorio.
- [ ] LCP, CLS y TBT tienen evidencia o quedaron marcados como no medidos.
- [ ] Se incluyeron accesibilidad, buenas prácticas y SEO básico.
- [ ] Cada recomendación tiene archivo y prioridad.

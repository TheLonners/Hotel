---
name: nextjs-performance-audit
description: Auditar y mejorar de forma segura el rendimiento de Next.js en la app hotelera, incluyendo Client Components, bundles, dashboard, calendario, datos, imágenes y re-renderizados.
---

# Auditoría de rendimiento Next.js

## Descripción

Revisar el coste de renderizado, JavaScript, red y datos del frontend Next.js y aplicar solo optimizaciones compatibles con el comportamiento existente.

## Cuándo usarla

- Cuando dashboard, calendario o tablas carguen lento.
- Antes de dividir bundles o mover componentes entre servidor y cliente.
- Cuando haya muchos `use client`, imports pesados o re-renderizados.

## Objetivo

Reducir trabajo inicial y repetido, manteniendo rutas, disponibilidad, calendario, CSV y semántica de reservas.

## Pasos de trabajo

1. Leer `frontend/package.json`, `next.config.mjs`, layout, páginas y componentes de alto tráfico.
2. Mapear cada `use client`, estado global/local, efectos, listeners, fetches y dependencias grandes.
3. Medir o inspeccionar build antes de cambiar; identificar dashboard, calendario, tablas, iconos e imágenes costosos.
4. Revisar si un Client Component puede permanecer cliente por interacción, browser API o estado; no moverlo por apariencia.
5. Aplicar primero cambios seguros: imports directos, memoización justificada, evitar fetches duplicados, paginar/virtualizar con pruebas y lazy loading de rutas pesadas.
6. Revisar imágenes, fuentes y configuración sin alterar URLs públicas ni el diseño global sin necesidad.
7. Ejecutar typecheck/build y probar rutas críticas en desktop y móvil.
8. Comparar evidencia antes/después y dejar recomendaciones no aplicadas separadas.

## Reglas importantes

- No convertir componentes a Server Components si usan interacción, `window`, almacenamiento o contextos cliente.
- No cambiar la frecuencia de actualización ni disponibilidad sin validar datos y conflictos.
- No introducir librerías nuevas para una mejora menor.
- No ocultar una demora con loaders sin resolver trabajo excesivo.
- Tratar el calendario y las tablas como zonas sensibles: conservar orden, fechas, estados y acciones.

## Comandos sugeridos

Confirmar `package.json`; aquí existen `pnpm typecheck` y `pnpm build`. Usar `pnpm dev:frontend` para prueba manual. Si se necesita bundle analyzer o Lighthouse, verificar antes si está instalado; no agregarlo automáticamente.

## Formato de salida

Entregar tabla `área | evidencia | coste probable | cambio aplicado/propuesto | riesgo | validación`, más comparación antes/después y pendientes.

## Checklist final

- [ ] Se revisaron Client Components, imports, fetches y re-renderizados.
- [ ] Se analizaron dashboard, calendario, tablas e imágenes.
- [ ] Se preservaron interacción y reglas de reservas.
- [ ] Typecheck/build pasan o la falla quedó explicada.
- [ ] Cada optimización tiene evidencia y riesgo.

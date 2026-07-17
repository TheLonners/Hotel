---
name: accessibility-responsive-audit
description: Auditar y mejorar accesibilidad, responsive y experiencia móvil del dashboard hotelero, incluyendo navegación, tablas, calendario, formularios, modales, foco, contraste y estados visuales.
---

# Auditoría responsive y de accesibilidad

## Descripción

Revisar la interfaz en desktop y móvil para lograr un dashboard moderno, claro, consistente, usable con teclado y robusto ante datos reales.

## Cuándo usarla

- Cuando el dashboard, menú lateral, tablas o calendario se rompan en móvil.
- Antes de cambios visuales globales.
- Cuando falten labels, foco, estados de error o jerarquía visual.

## Objetivo

Mejorar usabilidad sin rediseñar toda la app ni alterar contratos de reservas, calendario o CSV.

## Pasos de trabajo

1. Identificar layout, navegación, breakpoints, tokens y componentes compartidos.
2. Revisar móvil y escritorio: menú lateral, dashboard, tarjetas, tablas, calendario, formularios y modales.
3. Comprobar labels asociados, nombres accesibles, foco/hover, teclado, contraste, tamaños de texto y targets táctiles.
4. Revisar overflow, scroll, sticky headers, filas densas, mensajes de error, estados vacíos y carga.
5. Priorizar cambios pequeños en componentes compartidos y verificar cada consumidor.
6. Probar flujos de reservar, bloquear/liberar habitación, cargar CSV y navegar calendario con viewport móvil.
7. Ejecutar typecheck/build y registrar limitaciones si no hay automatización visual.

## Reglas importantes

- No esconder acciones críticas en móvil ni cambiar el significado de estados.
- No sustituir etiquetas por placeholders.
- No usar color como único indicador.
- No alterar fechas, orden, disponibilidad o separación Airbnb/WhatsApp por una mejora visual.
- No introducir CSS global que afecte pantallas no revisadas.
- Mantener foco visible y permitir cerrar modales con teclado cuando exista ese comportamiento.

## Comandos sugeridos

Revisar primero manifests. Usar `pnpm dev:frontend`, `pnpm typecheck` y `pnpm build`. Si no existe Playwright, documentar la prueba manual en viewport móvil y no inventar un script.

## Formato de salida

Tabla `pantalla/componente | problema | impacto | archivo | cambio | prioridad`, con notas de viewport, teclado, contraste y estados.

## Checklist final

- [ ] Se probaron desktop y móvil.
- [ ] Se revisaron navegación, tablas, calendario, formularios y modales.
- [ ] Labels, foco, teclado, contraste y errores tienen cobertura.
- [ ] Se preservaron flujos de reservas y CSV.
- [ ] Typecheck/build y evidencia manual quedaron registrados.

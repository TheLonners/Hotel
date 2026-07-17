# Seguimiento de remediación UI — 2026-07-16

## Alcance

Se completó el lote pendiente de la auditoría consolidada sin tocar contratos API, SQLite, disponibilidad, fechas, CSV ni la separación entre Airbnb y reservas directas.

## Cambios

| Hallazgo | Decisión | Archivos |
| --- | --- | --- |
| C-09 y C-10 | En móvil de altura máxima de 480 px el modal de reserva usa cabecera, tarjetas y pie compactos; conserva un único scroll en el contenedor del modal. | `frontend/src/styles/app.css` |
| C-13 | Las filas de huéspedes del dashboard son enfocables y abren el detalle con Enter o Espacio, además del clic. | `frontend/src/App.tsx`, `frontend/src/styles/app.css` |

Los demás hallazgos del informe ya estaban cubiertos por los cambios locales existentes de `visual-priority-remediation-2026-07-16.md`; se preservaron sin reescribirlos.

## Validación

- `pnpm typecheck`: PASS.
- `pnpm --filter hotel-reservas-backend test:integrity`: PASS.
- `pnpm build`: PASS.
- `git diff --check`: sin errores.

La validación interactiva del modal en el navegador móvil quedó incompleta: la navegación móvil cambió de vista, pero el estado del botón no abrió el modal antes de vencer el selector. Debe repetirse un recorrido manual de Nueva reserva a 640×360 y 360×640 antes de despliegue.

## Restauración del calendario

Tras detectar una regresión de fluidez, se retiraron las optimizaciones de JavaScript que alteraban el montaje de las celdas. El calendario vuelve a conservar sus 10.890 botones de día en el DOM y mantiene el filtrado y los eventos originales.

La causa restante era de layout: una regla posterior expandía las 66 filas a más de 4.400 px y obligaba al navegador a repintar toda la superficie durante el scroll. Se restauró una altura de viewport interna en escritorio y se añadió `content-visibility: auto` por fila. Esta contención es nativa del navegador: no desmonta botones ni cambia reservas, fechas, disponibilidad o acciones.

Validación final en una única pestaña limpia:

- Apertura de calendario: 924 ms.
- Celdas `.day-slot`: 10.890.
- Scroll horizontal de 900 px: 17 ms.
- Errores o advertencias de consola: 0.
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS.
- Integridad SQLite: PASS.

Se hizo explícito el scroll vertical del calendario en escritorio (`overflow-y: scroll`) y se añadió un carril de 12 px con contraste visible. Validación: `scrollTop` 0 → 700 px en 15 ms, 503 px de viewport interno sobre 4.432 px de contenido y 0 errores de consola.

Las 165 columnas del rango quedan montadas desde la apertura (10.890 botones para 66 habitaciones). Se retiró la ampliación automática al alcanzar los bordes horizontales: desplazarse ya no cambia el mes ni reconstruye el rango; este solo cambia mediante el selector, las flechas o «Hoy».

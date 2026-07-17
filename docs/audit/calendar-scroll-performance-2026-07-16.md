# Corrección de rendimiento del calendario — 2026-07-16

## Problema confirmado

El calendario se detenía durante el desplazamiento vertical y presentaba pausas al moverlo horizontalmente. La primera corrección intentó virtualizar filas según `scrollTop`, pero esa estrategia desmontaba y volvía a montar botones bajo el puntero durante el gesto. En la reproducción, el movimiento se detenía alrededor de 238 px tras cambiar la ventana de filas.

También se confirmó una regresión previa de pintura: `content-visibility` se había retirado de las 66 filas para permitir que un tooltip CSS saliera de su contenedor. Como consecuencia, el navegador debía considerar toda la grilla de 165 días durante cada desplazamiento.

## Decisión final

- Retirar completamente la virtualización reactiva ligada al evento `scroll`.
- Mantener estables las 66 filas y sus botones mientras el usuario arrastra o usa la rueda.
- Unificar habitaciones y fechas dentro de un solo `.calendar-scroll`. La columna de habitaciones permanece fija con `position: sticky`, pero comparte el mismo `scrollTop` que la grilla.
- Limitar cada bloque horizontal a 90 días: 30 días antes del mes seleccionado y 60 desde su primer día.
- Al acercarse a los últimos siete días de un extremo, cargar el mes vecino y conservar como ancla la fecha que estaba visible.
- Restaurar `content-visibility: auto` y una altura intrínseca de 66 px por fila, para omitir pintura y layout de filas fuera del viewport.
- Retirar el tooltip CSS que impedía la contención. Cada reserva conserva su atributo `title` con huésped, total y saldo, además de su nombre accesible.
- Mantener memorizados los encabezados y las filas para evitar cálculos repetidos por cambios de estado ajenos.
- Cargar las fotos del listado con `loading="lazy"` y `decoding="async"` para que su decodificación no interrumpa el desplazamiento.

No se modificaron reservas, disponibilidad, rutas API, CSV, esquema ni datos SQLite.

## Evidencia antes/después

| Caso | Antes | Después |
| --- | --- | --- |
| Gesto vertical repetido | La ventana de React cambiaba durante el scroll; el gesto reproducido se detenía cerca de 238 px | 12 pasos continuos de 180 px; posición final 2.160 px |
| Gesto horizontal repetido | Toda la grilla podía repintarse y coexistía con actualizaciones reactivas | 8 pasos continuos de 240 px; 1.920 px recorridos sin alterar `scrollTop` |
| Identidad de nodos | Filas desmontadas y recreadas según `scrollTop` | Filas estables durante todo el gesto |
| Pintura fuera de pantalla | Sin contención por fila | `content-visibility: auto` confirmado en el build publicado |
| Tamaño horizontal | 165 días y 10.890 celdas con 66 habitaciones | 90 días y 5.940 celdas; 45,5 % menos |
| Cambio de bloque | Rango fijo completo | Bloque vecino cargado al llegar al borde, conservando la fecha visible |
| Scroll vertical | Dos superficies y escrituras de `scrollTop` para sincronizarlas | Un solo contenedor; no existen eventos ni escrituras de sincronización |
| Scroll horizontal | La columna izquierda estaba fuera del contenedor horizontal | La columna es `sticky`; permaneció en x=284,8 px mientras las fechas recorrieron 1.200 px |
| Alineación | Dependía de espaciadores de virtualización | Coordenadas verticales idénticas entre habitación y fila en la muestra visible |

## Validaciones

- `pnpm typecheck`: correcto.
- `pnpm build`: correcto; ruta `/` de 42,3 kB y First Load JS de 145 kB.
- Build publicado probado en `http://127.0.0.1:3001/` con viewport de 1280 px.
- Recorridos vertical y horizontal sostenidos: correctos.
- Navegación julio → agosto → julio desde ambos extremos: correcta, siempre con 90 días montados.
- Sincronización entre la lista de habitaciones y la grilla: correcta.
- Un único elemento con overflow real: `.calendar-scroll`; `.room-list` tiene `scrollHeight === clientHeight` y `overflow: visible`.
- Alineación vertical exacta en cinco habitaciones muestreadas después de recorrer 1.800 px.
- Apertura y cierre del menú de una celda disponible: correctos.
- Fotos del calendario comprobadas con carga diferida y decodificación asíncrona.

## Lighthouse y limitaciones

El repositorio no declara Lighthouse ni un script equivalente, por lo que no se inventan puntajes de LCP, CLS o TBT. La verificación de esta corrección se basa en el build de producción, inspección del DOM/CSS y recorridos interactivos repetidos. Queda recomendado medir el mismo build en la Raspberry Pi con Lighthouse o Performance de Chromium cuando el despliegue esté disponible.

## Rollback

El cambio se limita a `frontend/src/App.tsx`, `frontend/src/lib/hotel-utils.ts` y `frontend/src/styles/app.css`. El scroll unificado se puede revertir restaurando las dos columnas desplazables y su sincronización; la ventana de 90 días puede revertirse de forma independiente. No existe rollback de datos.

## Limpieza asociada al scroll unificado

Se eliminaron únicamente candidatos con evidencia de uso exclusivo por el segundo scroll:

- `roomListRef`;
- `syncingScrollRef`;
- `syncVerticalScroll()`;
- handlers `onScroll` y `onWheel` de `.room-list`;
- scrollbar oculto y espaciador especial de 33 px de `.room-list`.

No se eliminaron componentes, rutas, dependencias, estilos compartidos ni lógica de reservas por no existir evidencia suficiente para una limpieza más amplia dentro de este lote.

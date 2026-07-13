# Auditoria responsive, UX y accesibilidad (Chrome)

Fecha: 2026-07-11. Entorno: `http://localhost:3001`; datos existentes (66 habitaciones y reservas). Alcance: verificacion manual con Chrome de las pantallas `Hoy`, `Calendario` y el modal `Nueva reserva`. No se modifico el producto.

## Cobertura y evidencia

| Caso | Resultado | Evidencia observable |
|---|---|---|
| Encabezado y navegacion | PASS parcial | Logo con texto alternativo; navegacion por botones; controles con nombre accesible. |
| Calendario a 360 x 800 | FAIL | Sin overflow horizontal de documento (345px), pero filtros de 34px de alto; acciones de celda fuera de pantalla quedan inaccesibles sin desplazamiento interno. |
| Calendario a 768 x 1024 | FAIL | Filtros de 34px y botones de celda de 18px; no cumplen objetivo tactil recomendado. |
| Calendario a 1366 x 768 | PASS parcial | No hay overflow horizontal del documento. Celdas/controles de calendario siguen teniendo objetivos de 18-38px. |
| Modal Nueva reserva a 360 x 800 | FAIL | `role=dialog`, `aria-modal=true` y `aria-labelledby` presentes, pero altura real 3242px, `position: static` y `overflow-y: hidden`; no cabe ni posee scroll interno. |
| Foco inicial de modal | FAIL | Tras abrir, `document.activeElement` permanece en `Nueva reserva`, no dentro del dialogo. |
| Cierre con Escape | FAIL | Al pulsar Escape con el dialogo abierto, este continua presente. |
| Etiquetas de formulario | PASS parcial | Campos importantes tienen `label`; buscador de habitacion tiene `aria-label`. Archivo y observaciones carecen de etiqueta programatica. |
| Selector de habitacion | FAIL UX | 66 botones se anuncian solo por codigo (`1`, `2`, ..., `PentHouse`) sin contexto de disponibilidad/capacidad. |
| Imagenes | PASS parcial | Logo tiene alt; fotos de habitacion usan `Habitacion <codigo>`. |

## Hallazgos priorizados

### UXA-01 - P1: modal de reserva inutilizable en movil

En 360 x 800 el dialogo de nueva reserva mide 330 x 3242px. Esta en flujo normal (`position: static`) con `overflow-y: hidden`; su contenido y acciones de guardado quedan fuera de la pantalla y no hay contenedor modal desplazable. Esto bloquea la creacion/edicion de reservas desde movil.

Recomendacion: overlay fijo con max-height relativo al viewport, `overflow-y: auto`, cabecera/acciones pegajosas y prueba automatizada del viewport movil.

### UXA-02 - P2: foco y Escape no cumplen el comportamiento de dialogo

El dialogo declara semantica ARIA pero no mueve el foco a un control interno al abrirse y Escape no lo cierra. El foco inicialmente queda en `Nueva reserva`.

Recomendacion: enfocar encabezado o primer campo al abrir, restaurar foco al disparador al cerrar y manejar Escape (con confirmacion si hay cambios pendientes).

### UXA-03 - P2: objetivos tactiles demasiado pequenos en calendario

A 360/768px hay filtros de 34px, botones de navegacion de 38px y acciones/celdas de 18px. Estas acciones son fundamentales para crear o revisar reservas.

Recomendacion: llevar objetivos a 44 x 44 CSS px o separar la accion de una celda visual mediante boton accesible de 44px.

### UXA-04 - P3: selector de habitacion sin nombres descriptivos

En el modal aparecen 66 botones anunciados unicamente como codigos. Archivo y observaciones no tienen etiqueta explicita.

Recomendacion: nombres como `Habitacion 502, Apartamento quintuple, disponible`; asociar `label`/`aria-label` a archivo y observaciones.

## Limitaciones

La aplicacion observable es una SPA con navegacion interna; la auditoria de roles y operaciones destructivas se delega a otros subagentes. No se realizaron envios ni cambios de datos.

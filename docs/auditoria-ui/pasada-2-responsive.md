# Pasada 2 — auditoría de responsividad

Fecha: 2026-07-16  
Instancia auditada: `http://127.0.0.1:5174/` (la instancia prevista en `:5173` no respondió durante la preparación). Backend comprobado en `:3001/api/health`.

## 1. Resumen ejecutivo

La aplicación conserva el ancho del documento sin desbordamiento horizontal en la vista de **Habitaciones** en las once resoluciones mínimas solicitadas. La navegación móvil, el menú «Más», el calendario y el modal de reserva cargaron correctamente en la instancia auditada.

La debilidad que exige atención es el formulario de **Nueva reserva** en pantallas de baja altura. En 640 × 360 (orientación horizontal), el encabezado y el pie fijo consumen casi toda la altura inicial y los campos quedan fuera de la primera vista; completar el formulario obliga a desplazarse por una superficie muy comprimida. En 360 × 640 el modal muestra más de un contexto de desplazamiento vertical, lo cual vuelve confuso llegar a los campos del formulario y a la selección de habitación.

Fortalezas observadas: no se detectó overflow horizontal del documento en las pruebas métricas de Habitaciones; los botones de la navegación móvil permanecieron dentro del viewport; el modal conserva acciones de cancelar y guardar visibles. Riesgo principal: la creación de una reserva puede resultar muy difícil en móviles apaisados o con poca altura, aun cuando no quede técnicamente bloqueada.

## 2. Cobertura

Las resoluciones se probaron con zoom del navegador al 100 %. El controlador disponible no expuso un ajuste verificable para 80 %, 125 % ni 150 %, por lo que no se les atribuye cobertura.

| Ruta o módulo | Visitado | Elementos probados | Resoluciones | Estado |
| --- | ---: | --- | --- | --- |
| `/` — Hoy | Sí | Navegación inferior y menú Más | 390 × 844 | Parcialmente auditado |
| `/` — Calendario | Sí | Navegación, apertura y cierre de Nueva reserva; dimensiones del modal | 2560 × 1440, 360 × 640, 640 × 360 | Parcialmente auditado |
| `/` — Habitaciones | Sí | Navegación, filtros/acciones visibles y métrica de overflow | 360 × 640, 375 × 667, 390 × 844, 412 × 915, 768 × 1024, 820 × 1180, 1280 × 720, 1366 × 768, 1440 × 900, 1920 × 1080, 2560 × 1440 | Parcialmente auditado |
| `/` — Limpieza | No | Inventariado desde la navegación | — | No fue posible auditar |
| `/` — Dashboard | No | Inventariado desde la navegación | — | No fue posible auditar |
| `/` — Reservas Airbnb | No | Inventariado desde la navegación | — | No fue posible auditar |
| `/` — Importar | No | Inventariado desde la navegación | — | No fue posible auditar |
| `/` — Cuenta de cobro | No | Inventariado desde la navegación | — | No fue posible auditar |
| `/sistema-ui` | No | Ruta identificada en el repositorio; no abierta en esta pasada | — | No fue posible auditar |

Comprobación de ancho: en Habitaciones, `scrollWidth === clientWidth` del documento en las once resoluciones de la tabla. Esta comprobación no sustituye una revisión visual completa de cada módulo ni demuestra que sus tablas, modales o flujos sean usables.

## 3. Inventario

Inventario independiente encontrado en la instancia y en la estructura de navegación. «Probado» significa que se activó o se midió en esta pasada; «visible» no equivale a aprobación funcional.

| Grupo | Elementos encontrados | Estado |
| --- | --- | --- |
| Navegación global | Abrir menú; Hoy; Calendario; Limpieza; Dashboard; Habitaciones; Reservas Airbnb; Importar; Cuenta de cobro | Probados: Calendario, Habitaciones y menú móvil Más. Resto visible/inventariado. |
| Navegación móvil | Calendario, Limpieza, Hoy, Dashboard, Más; panel Más con Habitaciones, Airbnb, Importar, Reservas y Cuenta de cobro | Probados: Más, Calendario y Habitaciones. |
| Hoy | Nueva reserva, KPIs, tarjetas de reservas, «Ver todas» | Visibles; Nueva reserva fue inspeccionada desde Calendario, no se completó desde Hoy. |
| Calendario | Nueva reserva, mes anterior/siguiente, Hoy, bloqueo, sincronización, filtros de canal/estado, Disponibilidad, Resumen, celdas de día/habitaciones, tarjetas de reserva | Probados: Nueva reserva y cierre. Inventariados los demás; no se alteraron bloqueos ni reservas reales. |
| Modal de reserva | Volver, cerrar, selección de habitación, pasos 1–3, campos de reserva/huésped/economía y pie Cancelar/Guardar reserva | Probados: apertura, cierre y medición de viewport. No se envió el formulario. |
| Habitaciones | Crear habitación, pestañas de estado, limpiar, guardar, bloquear, editar y mostrar más | Visibles y medidos en los breakpoints; no se activaron acciones que pudieran afectar habitaciones reales. |

## 4. Hallazgos

### [P2-R01] El formulario de nueva reserva queda excesivamente comprimido en móvil horizontal

**Severidad:** Alta  
**Categoría:** Responsividad / formularios / pantallas de poca altura  
**Ruta:** `/` (vista Calendario)  
**Sección:** Modal «Nueva reserva»  
**Resolución:** 640 × 360, orientación horizontal  
**Zoom:** 100 %  
**Elemento afectado:** Encabezado, contenido desplazable y pie fijo del formulario de creación  
**Descripción:** El modal ocupa los 360 px de alto disponibles. El encabezado, subtítulo y pasos permanecen apilados arriba, mientras que el pie fijo ocupa aproximadamente 80 px. En la vista inicial solo se ve el inicio de la tarjeta de habitación; los campos necesarios para crear la reserva quedan fuera de la primera vista y el área desplazable del modal mide 528 px de alto para 360 px visibles.  
**Pasos para reproducir:** 1. Abrir Calendario. 2. Pulsar «Nueva reserva». 3. Cambiar a 640 × 360 o girar un móvil a horizontal. 4. Observar la primera vista del formulario.  
**Resultado actual:** El flujo empieza con el contenido de datos oculto bajo la línea de pliegue y el usuario debe desplazarse en una interfaz vertical muy comprimida antes de poder introducir los datos esenciales.  
**Resultado esperado:** En horizontal o altura igual/inferior a 360 px, el formulario debe presentar una cabecera compacta y un único cuerpo desplazable, dejando visibles las primeras entradas útiles sin que el pie fijo reduzca de forma desproporcionada el área disponible.  
**Impacto:** Un formulario principal resulta difícil de completar en un escenario móvil habitual; aumenta el riesgo de abandono, errores de selección y de que el usuario no advierta qué datos faltan antes de guardar.  
**Recomendación concreta:** Para `max-height: 480px` y anchos móviles, convertir el encabezado a una fila compacta (título + cierre y pasos en una sola línea o con menor separación), fijar el pie a 56 px más `safe-area-inset-bottom`, y dar al cuerpo `min-height: 0; overflow-y: auto` dentro de una estructura flex de `100dvh`. Evitar márgenes verticales grandes de las tarjetas en este modo.  
**Criterios de aceptación:** A 640 × 360, la primera vista contiene el encabezado compacto, el control de habitación completo o su etiqueta y campo, y ambos botones del pie; solo hay un scroll vertical para recorrer los campos; ningún campo o botón queda tapado por el pie fijo.  
**Evidencia:** `evidencias/pasada-2/calendario-crear-reserva-640x360-horizontal-scroll-formulario.png`.

### [P2-R02] El modal de reserva presenta desplazamiento vertical anidado en móvil vertical

**Severidad:** Media  
**Categoría:** Responsividad / interacción táctil  
**Ruta:** `/` (vista Calendario)  
**Sección:** Modal «Nueva reserva», bloque de habitación  
**Resolución:** 360 × 640, orientación vertical  
**Zoom:** 100 %  
**Elemento afectado:** Área desplazable del modal y panel de selección de habitación  
**Descripción:** En 360 × 640 el diálogo mide 640 px de alto pero su contenido desplazable mide 675 px. La evidencia muestra a la vez el scroll del modal y otro scroll visible en el bloque de habitación, de modo que hay más de una superficie vertical que responde al gesto táctil.  
**Pasos para reproducir:** 1. Abrir Calendario. 2. Pulsar «Nueva reserva». 3. Usar viewport 360 × 640. 4. Revisar la zona de selección de habitación y arrastrar para acceder al resto del formulario.  
**Resultado actual:** El usuario ve barras/zonas de scroll simultáneas antes de completar el primer paso, sin una delimitación visual suficiente de qué superficie debe desplazar.  
**Resultado esperado:** El modal debe tener un único scroll principal; si la lista de habitaciones requiere desplazamiento, debe abrirse como selector independiente (por ejemplo, bottom sheet o popover) con altura limitada y cierre claro, sin mantener otro scroll competidor en la vista base.  
**Impacto:** El desplazamiento anidado en móvil causa gestos que no avanzan el formulario esperado y hace más lenta la selección de habitación, primer paso obligatorio del flujo.  
**Recomendación concreta:** Mantener el formulario como única región desplazable y transformar «Seleccionar habitación» en un selector que se despliegue sobre el formulario con `max-height` propio y fondo modal; cerrar el selector al elegir una habitación. Si se conserva el panel actual, desactivar su `overflow-y` mientras esté embebido en el modal.  
**Criterios de aceptación:** A 360 × 640, al arrastrar sobre el formulario se desplaza una sola región. Al abrir la lista de habitaciones, la región activa queda claramente aislada y se cierra al seleccionar, cancelar o tocar fuera; al cerrar, el formulario conserva su posición.  
**Evidencia:** `evidencias/pasada-2/calendario-crear-reserva-360x640-scroll-formulario.png`.

## 5. Componentes y variantes responsivas a estandarizar

| Familia | Variantes observadas | Regla recomendada a implementar |
| --- | --- | --- |
| Modal de formulario | Cabecera alta, cuerpo con scroll, pie fijo; comportamiento distinto en vertical y horizontal | Definir una variante `form-modal--compact-height` para alturas ≤480 px, con cabecera reducida y una sola región de scroll. |
| Selector de habitación dentro de formulario | Panel embebido con scroll concurrente | Usar una variante de selector modal/popover con foco y desplazamiento aislados. |
| Pie de acciones móvil | Cancelar y Guardar fijos | Definir altura, separación y safe area comunes; el cuerpo del modal debe reservar explícitamente ese espacio. |

## 6. Datos de prueba y limpieza

- Registros creados: ninguno.
- Registros editados: ninguno.
- Registros eliminados: ninguno.
- Registros que no pudieron eliminarse: ninguno.
- Confirmación: esta pasada no escribió en SQLite ni modificó reservas, habitaciones, usuarios, configuraciones o datos reales. Por tanto no quedaron datos sintéticos `AUDITORIA-UI-P2` pendientes de limpieza.

## 7. Limitaciones

- La auditoría no pudo completar el flujo sintético de reserva (crear, editar y eliminar) sin ampliar la pasada. Solo se abrió y cerró el formulario para medir su presentación; no se enviaron datos.
- No se auditaron visualmente Limpieza, Dashboard, Reservas Airbnb, Importar, Cuenta de cobro ni `/sistema-ui`; aparecen explícitamente como no auditados y deben pasar por una nueva verificación.
- Las pruebas de zoom 80 %, 125 % y 150 % no se realizaron porque el controlador disponible no expuso un mecanismo verificable de zoom de navegador. Todas las mediciones indicadas fueron a 100 %.
- No se verificaron estados de contenido largo/corto en todos los módulos, orientación horizontal fuera del modal de reservas, ni los modos de sidebar abierto/cerrado que no correspondían al menú móvil probado.
- La evidencia se limita a pantallas del flujo sin introducir datos de prueba. Las capturas se guardaron antes de finalizar y no se incluyen datos sintéticos.

# Pasada 3 — interacción y experiencia visual (P3)

Fecha: 2026-07-16

## 1. Resumen ejecutivo

Esta pasada preparó y comprobó la aplicación local con `GET http://127.0.0.1:5174/` (200) y `GET http://127.0.0.1:3001/api/health` (200). El repositorio usa pnpm, Next.js 15/React 19/TypeScript/Tailwind en `frontend/`, Express/CommonJS y SQLite (`better-sqlite3`) en `backend/`; los comandos declarados son `pnpm install:all`, `pnpm dev:frontend` y `pnpm dev:backend`.

La inspección visual e interactiva en vivo quedó bloqueada por la infraestructura de automatización: el control de Chrome agotó el tiempo al navegar una pestaña P3 hacia `http://127.0.0.1:5174/`, pese a que la URL respondió por HTTP; el fallback de control de Windows se detuvo antes de la primera captura porque no pudo determinar la URL activa con suficiente confianza. Por lo tanto, **no se afirma que ninguna ruta, botón, estado, resolución o flujo haya sido probado visualmente** y no se generaron capturas. No se creó, editó ni eliminó ningún dato sintético.

Para que la pasada siga siendo útil, se hizo un inventario independiente y una revisión estática, acotada a los flujos/interacciones declarados en `frontend/src/App.tsx`. Esta evidencia permite identificar cuatro riesgos concretos que requieren verificación manual posterior, pero no sustituye la auditoría funcional solicitada.

Fortalezas observables en código: avisos globales con `role=status`/`role=alert`, estados disabled para varias operaciones, foco visible global y un foco atrapado/restaurado para el formulario de reserva. Debilidades principales: los otros diálogos no tienen el mismo contrato de teclado/foco, la sincronización Airbnb no es accesible desde navegaciones de escritorio y las filas de la tabla del dashboard son activables solo con ratón.

## 2. Cobertura

| Ruta o módulo | Visitado | Elementos probados | Resoluciones | Estado |
| ------------- | -------: | ------------------ | ------------ | ------ |
| Hoy | No | 0; inventario estático de accesos rápidos, filtros y listas | No disponible | No fue posible auditar |
| Calendario | No | 0; inventario de filtros, celda, agenda, detalle y bloqueo | No disponible | No fue posible auditar |
| Limpieza | No | 0; inventario desktop/móvil, estados y evidencia | No disponible | No fue posible auditar |
| Dashboard | No | 0; inventario de filtros, tabla, exportación y alertas | No disponible | No fue posible auditar |
| Habitaciones | No | 0; inventario de búsqueda, filtros, editor e iCal | No disponible | No fue posible auditar |
| Reservas Airbnb | No | 0; inventario de búsqueda y edición de nombre | No disponible | No fue posible auditar |
| Sincronización Airbnb | No | 0; componente identificado estáticamente | No disponible | Parcialmente auditado |
| Importar / respaldos | No | 0; inventario de cargas, previews, confirmaciones y exportaciones | No disponible | No fue posible auditar |
| Cuenta de cobro | No | 0; inventario de selección, cálculo y exportación | No disponible | No fue posible auditar |
| Formulario, detalle y bloqueo de reservas | No | 0; inventario de modales/paneles y acciones | No disponible | Parcialmente auditado |

Resoluciones, zoom, orientación, hover, active, loading, errores de red, mensajes de éxito, click fuera, atrás del navegador y persistencia de filtros: no verificables en esta ejecución.

## 3. Inventario propio

Hallado estáticamente (sin marcar como probado):

- Navegación: menú superior para Hoy, Calendario, Limpieza, Dashboard, Habitaciones, Reservas Airbnb, Importar y Cuenta de cobro; navegación inferior móvil con Calendario, Hoy, Limpieza, Más y Airbnb.
- Calendario: cambio de mes, Hoy, nueva reserva, bloqueo, sincronización iCal, filtros de habitación/huésped/canal/estado/alertas, disponibilidad, resumen, celdas, reservas, bloqueos, llegadas y panel de ingresos.
- Reservas: formulario de creación/edición, selector múltiple de habitaciones, datos de huésped, fechas/noches, valores, canal, comprobantes, detalle, pagos, marcar saldo pagado, reprogramar, finalizar, cancelar y eliminar.
- Limpieza: fecha, actualizar, filtros, búsqueda, selector de habitación, iniciar/finalizar limpieza, checklist, novedad, notas y carga de evidencia.
- Dashboard: rango/mes, canal, actualización, exportación, búsqueda, filas de huéspedes, alertas, próximos ingresos y salidas.
- Habitaciones/Airbnb: búsqueda, estado, crear/editar/desactivar habitación, probar enlace iCal, gestionar feed, sincronizar/pausar/eliminar feed, búsqueda de reservas Airbnb y guardado de nombre.
- Importación: generar backup, importar reservas/habitaciones/Airbnb, forzar alertas, mapping de listing, cancelar/confirmar previews, descargas y guía.
- Cuenta de cobro: rango, porcentajes/cargos, selección de remisiones, actualización y exportación Excel/PDF.

Controles encontrados estáticamente: 9 módulos de vista, 7 superficies de diálogo/panel, múltiples botones principales/secundarios/icono, filtros, inputs, selects, checkboxes, tablas, `details`, cargas de archivos y exportaciones. Controles probados en UI: **0**, por la limitación descrita.

## 4. Hallazgos

### [P3-INT-001] Los diálogos secundarios no comparten el contrato de foco y Escape del formulario de reserva

**Severidad:** Alta  
**Categoría:** Accesibilidad visual / interacción de modales  
**Ruta:** Calendario y reservas (bloqueo, detalle, disponibilidad); móvil Hoy/Limpieza  
**Sección:** Paneles y modales secundarios  
**Resolución:** No verificada  
**Zoom:** No verificado  
**Elemento afectado:** `BlockModal`, `BlockDetailPanel`, `AvailabilityPanel`, `DetailPanel`, `MobileQuickAccessPanel` y `MobileCleaningDetailPanel`  
**Descripción:** Solo `ReservationModal` implementa al abrir inercia de hermanos, foco inicial, ciclo de Tab, Escape y devolución de foco. Los demás elementos se declaran como `role="dialog" aria-modal="true"`, pero no tienen un manejador de teclado ni un contrato equivalente visible en su componente.  
**Pasos para reproducir:** 1. Abrir un detalle de reserva, disponibilidad o bloqueo. 2. Pulsar Tab repetidamente, Shift+Tab y Escape. 3. Comprobar si el foco permanece dentro, Escape cierra y el foco regresa al invocador.  
**Resultado actual:** No se puede verificar en ejecución; la implementación estática no contiene esas garantías fuera de `ReservationModal`.  
**Resultado esperado:** Cada superficie modal debe capturar/restaurar foco, cerrar con Escape cuando no hay una operación en curso y no permitir alcanzar controles del fondo.  
**Impacto:** Un usuario de teclado puede perder contexto, operar accidentalmente contenido subyacente o no hallar la forma de cerrar un panel; afecta tareas de reservas, bloqueos y limpieza.  
**Recomendación concreta:** Extraer un wrapper de diálogo reutilizable o aplicar el mismo hook de `ReservationModal` a los seis paneles: foco inicial seguro, ciclo Tab/Shift+Tab, Escape condicionado a no estar guardando, `inert` para el fondo y restauración del foco del disparador.  
**Criterios de aceptación:** En cada diálogo, Tab y Shift+Tab nunca salen del diálogo; Escape lo cierra; el foco vuelve al botón/celda/fila que lo abrió; lectores de pantalla no leen el fondo mientras está abierto.  
**Evidencia:** Revisión estática de `frontend/src/App.tsx` (diálogos en líneas aproximadas 1238, 1592, 1799, 1910, 1963, 2228 y 2806); sin captura, bloqueo de control visual documentado en Limitaciones.

### [P3-INT-002] La gestión de feeds de sincronización Airbnb no tiene entrada en la navegación de escritorio

**Severidad:** Media  
**Categoría:** Descubribilidad / navegación  
**Ruta:** Módulo `airbnb`  
**Sección:** Menú superior y sidebar del dashboard  
**Resolución:** No verificada  
**Zoom:** No verificado  
**Elemento afectado:** `AirbnbSyncView`  
**Descripción:** El tipo de vista y el render del componente existen, y la navegación inferior móvil contiene una opción Airbnb. Sin embargo, el menú superior y la navegación lateral del dashboard solo enlazan a `airbnbReservations`; no hay una acción de escritorio que llame `setView("airbnb")`.  
**Pasos para reproducir:** 1. En escritorio, recorrer todos los botones del menú superior y sidebar del Dashboard. 2. Buscar una acción para gestionar feeds iCal.  
**Resultado actual:** Debe verificarse en UI; la búsqueda estática encontró el componente en el render, pero ninguna transición desktop a la vista `airbnb`.  
**Resultado esperado:** La gestión de enlaces/sincronización Airbnb debe ser alcanzable de forma inequívoca en desktop y móvil, con etiqueta distinta de “Reservas Airbnb”.  
**Impacto:** Configurar, pausar, probar o eliminar feeds puede quedar oculto para usuarios de escritorio, mientras la sincronización es una función operativa importante.  
**Recomendación concreta:** Añadir una entrada “Sincronización Airbnb” o submenú desde “Reservas Airbnb” tanto en menú superior como sidebar, reutilizando el estado `view="airbnb"`; indicar claramente la diferencia entre ver reservas y administrar feeds.  
**Criterios de aceptación:** Un usuario desktop llega a `AirbnbSyncView` mediante navegación visible en uno o dos clics; el elemento activo se identifica; teclado y móvil alcanzan la misma función.  
**Evidencia:** Revisión estática de `frontend/src/App.tsx`: tipo de vista cerca de línea 62, render cerca de 367, nav desktop cerca de 311–319, nav dashboard cerca de 3031–3055 y opción móvil cerca de 443–488; sin captura.

### [P3-INT-003] Las filas interactivas de la tabla de huéspedes del dashboard no son accesibles por teclado

**Severidad:** Media  
**Categoría:** Navegación por teclado / tabla  
**Ruta:** Dashboard  
**Sección:** Lista de huéspedes  
**Resolución:** No verificada  
**Zoom:** No verificado  
**Elemento afectado:** Filas `tr` de `dashboard-guest-list`  
**Descripción:** Cada fila usa `onClick` para abrir el detalle de una reserva, pero no tiene botón/enlace interno, `tabIndex`, rol ni manejo de Enter/Espacio. El hover estilizado no proporciona una alternativa semántica.  
**Pasos para reproducir:** 1. Navegar al Dashboard. 2. Usar Tab hasta la lista de huéspedes. 3. Intentar abrir una fila con Enter o Espacio.  
**Resultado actual:** Pendiente de verificación en vivo; el marcado estático solo permite la activación con puntero.  
**Resultado esperado:** Cada reserva debe abrirse desde teclado y anunciar que abre el detalle.  
**Impacto:** La vista de detalle de reservas queda inaccesible para usuarios de teclado y tecnologías asistivas; además el comportamiento clicable de una fila no se descubre bien.  
**Recomendación concreta:** Reemplazar el `onClick` de `tr` por un enlace o botón “Ver detalle” en una celda (preferido), o agregar el patrón de fila interactiva completo (`tabIndex=0`, role apropiado, `onKeyDown` para Enter/Espacio, nombre accesible y estilos de foco).  
**Criterios de aceptación:** Tab alcanza una acción por fila; Enter y Espacio abren exactamente el mismo detalle que el clic; el foco visible identifica la fila/acción; lectores de pantalla anuncian el propósito.  
**Evidencia:** Revisión estática de `frontend/src/App.tsx` cerca de líneas 3136–3160 y estilos hover cerca de `frontend/src/styles/app.css` 4144–4148; sin captura.

### [P3-INT-004] Los errores de modales/paneles secundarios no siempre se anuncian como alertas

**Severidad:** Media  
**Categoría:** Feedback / estados de error  
**Ruta:** Calendario y bloqueo  
**Sección:** Bloquear habitaciones, detalle de bloqueo y disponibilidad  
**Resolución:** No verificada  
**Zoom:** No verificado  
**Elemento afectado:** Mensajes `error` locales en `BlockModal`, `BlockDetailPanel` y `AvailabilityPanel`  
**Descripción:** La aplicación raíz sí utiliza `role="alert"` para errores y `aria-live` para carga/toasts, pero los tres paneles secundarios renderizan `<div className="notice error">` sin rol ni región viva.  
**Pasos para reproducir:** 1. Provocar un error de disponibilidad o de guardar/editar bloqueo. 2. Observar si el mensaje se anuncia sin mover el foco.  
**Resultado actual:** No probado; el DOM estático no proporciona semántica de alerta en esos mensajes.  
**Resultado esperado:** El mensaje debe ser visible, específico y anunciado inmediatamente sin obligar a buscarlo visualmente.  
**Impacto:** Los fallos al reservar/bloquear pueden pasar desapercibidos, especialmente en formularios largos o para lectores de pantalla.  
**Recomendación concreta:** Añadir `role="alert"` a los errores locales, conservar el texto específico de API y mover el foco al resumen de error solo si el flujo no puede continuar.  
**Criterios de aceptación:** Cada error en bloqueo/disponibilidad se anuncia una sola vez, queda visible junto al contexto de la acción y el usuario puede corregir el campo o cerrar el panel con teclado.  
**Evidencia:** Revisión estática de `frontend/src/App.tsx` cerca de líneas 1801, 1919 y 1968, comparada con los avisos raíz cerca de 323–325; sin captura.

## 5. Componentes inconsistentes

| Familia | Variante que sí ofrece contrato completo | Variantes que deben igualarlo |
| --- | --- | --- |
| Diálogo/modal | `ReservationModal`: foco inicial, trampa de Tab, Escape, fondo inerte y retorno de foco | Bloqueo, detalle de bloqueo, disponibilidad, detalle de reserva, acceso rápido móvil y detalle de limpieza móvil |
| Mensajería de error | Avisos raíz con `role=alert` | Errores locales de bloqueo, detalle de bloqueo y disponibilidad |
| Apertura de detalle | Botones de listas, celdas y tarjetas | Filas clicables de la tabla de huéspedes del Dashboard |
| Navegación Airbnb | Opción móvil “Airbnb” | Menú superior y sidebar desktop para la vista de feeds |

## 6. Datos de prueba

- Registros creados: ninguno.
- Registros editados: ninguno.
- Registros eliminados: ninguno.
- Registros que no pudieron eliminarse: ninguno; no se llegaron a crear.
- Confirmación: no se modificaron datos reales ni sintéticos. La limpieza P3 está completa por ausencia de datos P3.

## 7. Limitaciones

- La URL del frontend respondió HTTP 200 y el backend respondió health 200, pero Chrome controlado agotó el tiempo al navegar una pestaña aislada P3 a `http://127.0.0.1:5174/`.
- El fallback de control visual de Windows se detuvo antes de capturar/interactuar: no pudo determinar con suficiente confianza la URL del navegador. Por seguridad de esa herramienta no se reintentó con entrada de usuario simulada.
- No se verificaron en vivo rutas, resoluciones (incluidas 360×640 a 2560×1440), zoom, orientaciones, estados hover/focus/active/loading/error/success/empty, menú lateral, click fuera, Escape/Enter, atrás, carga de archivos, exportaciones ni flujo completo de reservas.
- No hay evidencias PNG en `docs/auditoria-ui/evidencias/pasada-3/`; la carpeta existe pero está vacía. Las recomendaciones anteriores son hallazgos de revisión estática y requieren una pasada visual P3 de repetición antes de implementar cambios.

# Auditoría funcional en Chrome

Fecha: 2026-07-11  
Alcance: revisión en ejecución de la interfaz disponible en `http://localhost:3001/`, mediante la extensión de Chrome de Codex. No se modificó código de aplicación ni se enviaron formularios persistentes.

## Entorno y límites

- El servidor ya estaba escuchando en `0.0.0.0:3001`; `frontend/out/index.html` estaba presente y Chrome abrió la aplicación correctamente.
- La aplicación presenta datos operativos reales (por ejemplo, 47 reservas y datos parcialmente enmascarados). Por seguridad de los datos, no se crearon, editaron, cancelaron ni eliminaron reservas, habitaciones, pagos, bloques, archivos o respaldos desde Chrome. Esas pruebas requieren una base de datos clonada/semilla y autorización explícita para efectos persistentes.
- Las descargas, importaciones y generación de backups se inventariaron, pero no se accionaron: una descarga/grabación local requiere confirmación de acción y las importaciones/backups cambian el sistema.
- La aplicación actual usa SQLite, no PostgreSQL. Por tanto, no hubo evidencia de PostgreSQL que validar desde esta revisión.

## Evidencia de navegación y comportamiento observado

| Módulo / vista | Acciones comprobadas en Chrome | Resultado |
|---|---|---|
| Hoy | Carga inicial, métricas, listas de hospedados/llegadas y apertura del formulario Nueva reserva | PASS para renderizado y apertura de modal. |
| Calendario | Navegación, filtro Airbnb y búsqueda de habitación inexistente | PASS: filtro dejó 27 marcadores `Airbnb no disponible`; búsqueda dejó 0 habitaciones/0 celdas de creación visibles. |
| Limpieza | Navegación e inventario visible: fecha, selector, buscador, filtros, actualizar y exportar | PASS de renderizado; acciones con descarga/estado no ejecutadas. |
| Dashboard | Navegación, inventario de filtros de periodo/canal y renderizado móvil | PASS de renderizado; a 360x800 no se detectó desbordamiento horizontal. |
| Habitaciones | Navegación e inventario de filtros/formulario/acciones | PASS de renderizado. Crear, editar, desactivar, bloquear y sincronizar iCal no ejecutados por ser persistentes. |
| Reservas Airbnb | Navegación, buscador por código `HMXA2BCHAD` y estado deshabilitado del guardado de nombre vacío | PASS: quedó una única tarjeta coincidente y ningún Guardar habilitado. |
| Importar y backups | Navegación/inventario de tres entradas de archivo, exportaciones y backup manual | BLOCKED: acciones no ejecutadas por efectos de archivo/datos. |
| Cuenta de cobro | Navegación/inventario de fechas, campos y exportación Excel/PDF | PASS de renderizado; exportaciones no ejecutadas. |
| Menú móvil | A 360x800, Abrir menú mostró las 8 rutas; Cerrar menú expuso estado expandido | PASS. |
| Modal Nueva reserva | Apertura, campos/controles, cierre por botón y Escape | FAIL para Escape; PASS para botón Cerrar. |

## Hallazgos

### P2 — El modal de Nueva reserva no se cierra con Escape

- **Caso:** `CHR-012`.
- **Evidencia:** el diálogo `Detalles de Reserva: Nueva` siguió presente después de enviar `Escape` al propio diálogo (`before: 1`, `afterEscape: 1`). El botón accesible `Cerrar formulario de reserva` sí lo cerró (`afterClick: 0`).
- **Impacto:** incumple una expectativa básica de modal y dificulta la operación por teclado; también deja sin confirmar el manejo de foco/diálogo conforme a accesibilidad.
- **Causa raíz:** no investigada en código por este subagente; requiere corrección y retest en Chrome.

### P3 — Semántica de encabezado inconsistente en Reservas Airbnb

- La vista muestra `Reservas Airbnb` como texto destacado pero no como encabezado `h1` (a diferencia de Hoy, Calendario, Limpieza, Dashboard, Habitaciones e Importar). Es una inconsistencia de estructura para lectores de pantalla y navegación por encabezados.

### P3 — Calendario con superficie DOM extremadamente grande

- Un snapshot de la vista Calendario superó 129 mil tokens debido a los botones de acción de cada habitación/día durante un rango de aproximadamente cinco meses. El comportamiento visual abrió correctamente, pero esta densidad es un indicador medible de riesgo de rendimiento/accesibilidad para teclado y lectores de pantalla. Falta una medición de rendimiento y pruebas con más datos.

## Consola, red y persistencia

- Consola: `0` mensajes de nivel warning/error durante las rutas y acciones registradas.
- Red: no se expone inspección de requests en la superficie de Chrome disponible; no se observó error visual ni error de consola al navegar/filtrar. Se requiere registrar HAR/DevTools o instrumentación de API para declarar 4xx/5xx, payloads y tiempos como verificados.
- Persistencia: no se realizó ninguna operación de escritura. No se puede declarar validada.

## Responsive

- 360x800: menú colapsable operativo; Dashboard sin overflow horizontal (`document/body scrollWidth = 360`); ancho de `main` 345 px y 28 controles interactivos visibles.
- Falta ejecutar 390x844, 412x915, 768x1024, 1024x768, 1366x768, 1440x900 y 1920x1080 de todos los módulos.

## Bloqueos para completar flujos críticos

1. Base de datos aislada, restituible y con datos de prueba para operaciones de creación, pagos, cancelación, iCal, importación/restauración y concurrencia.
2. Autorización en el momento de ejecutar operaciones que escriben datos/archivos, o instrucciones del orquestador para operar exclusivamente contra el clon de prueba.
3. Acceso a captura de red/HAR o logs de servidor correlacionados para acreditar métodos, payloads, 4xx/5xx y duración.
4. Roles/sesiones de prueba; la interfaz abierta no exhibe un flujo de autenticación ni selector de rol verificable.

## Conclusión del subagente Chrome

Estado: **AUDITORÍA FUNCIONAL PARCIAL**. Se verificaron rutas visibles, filtros, búsquedas, menú móvil, renderizado y el modal de nueva reserva; se encontró un P2 reproducible. No es correcto declarar la auditoría completa mientras falten flujos persistentes, red, base de datos, roles, importación/exportación, backups, seguridad y regresión tras corrección.

# Pasada 1 — Consistencia visual

Fecha: 2026-07-16. Instancia auditada: `http://127.0.0.1:5174/` (API en `3001`).

## 1. Resumen ejecutivo

La aplicación tiene una base visual agradable y reconocible: fondo degradado suave, verde de acción consistente, iconografía lineal y una identidad Vista Montaña visible. Las pantallas de Hoy, Limpieza y Habitaciones son legibles en el primer pliegue.

La consistencia es **media**. Coexisten varios lenguajes de layout para la misma aplicación: shell con barra lateral grande, cabeceras tipo tarjeta, hero tipográfico, paneles operativos de dos columnas y formularios modales muy ornamentados. Comparten color general, pero no una escala estable de tipografía, contenedor, altura de control, densidad ni jerarquía. El calendario concentra demasiados controles en una sola línea: a 1440 px el botón de sincronización queda cortado por el borde derecho.

Fortalezas: tarjeta KPI y acción primaria se entienden bien; el modal de reserva agrupa sus secciones; limpieza ofrece jerarquía de tarea y estado clara; el móvil de Hoy conserva acciones principales grandes.

Debilidades: variación marcada entre módulos equivalentes, toolbar de calendario sobresaturada, tarjetas de calendario demasiado densas y truncadas, y distinción visual entre experiencias desktop/móvil que supera una adaptación de formato.

No se encontró un problema crítico de consistencia que impida leer una pantalla. El flujo de creación de la reserva sintética no se completó: el formulario mantuvo el aviso de fechas al intentar guardar aun después de establecer dos noches. No se generaron datos P1; se registró como limitación de cobertura, no como conclusión de funcionalidad.

### Preparación confirmada

- Monorepo `pnpm`; frontend Next.js 15 / React 19 / TypeScript / Tailwind CSS, backend Express CommonJS y SQLite mediante `better-sqlite3`.
- Desarrollo: `pnpm dev:frontend` (configurado en 5173); para esta auditoría se utilizó la instancia ya verificada en 5174. Backend configurado por `PORT`, con instancia disponible en 3001.
- Rutas UI: una shell de cliente (`frontend/src/App.tsx`) con vistas internas Hoy, Calendario, Limpieza, Dashboard, Habitaciones, Airbnb, Reservas Airbnb, Importar y Cuenta de cobro. No son URLs independientes.
- Estilos principales: `frontend/src/styles/app.css`, carga global desde `frontend/src/app/globals.css`; componentes base Radix y Lucide declarados en el manifiesto.
- No se hallaron credenciales de auditoría documentadas que fuese seguro usar. Los GET funcionaron; no se alteró autenticación ni configuración.

## 2. Cobertura

| Ruta o módulo | Visitado | Elementos probados | Resoluciones | Estado |
| --- | ---: | --- | --- | --- |
| Hoy | Sí | fecha, Nueva reserva, accesos rápidos, navegación | 1440×900, 390×844 | Parcialmente auditado |
| Calendario | Sí | navegación mensual, filtros, búsqueda, resumen, disponibilidad, Nueva reserva, bloqueo (apertura no confirmada) | 1440×900 | Parcialmente auditado |
| Modal de reserva | Sí | selector de habitación, campos, noches, canal, recalcular, guardar, cierre | 1440×900 | Parcialmente auditado |
| Limpieza | Sí | fecha, actualizar, búsqueda, filtros, selección de habitación, checklist y acciones visibles | 1440×900 | Parcialmente auditado |
| Dashboard | Sí | periodo, actualización, exportación y tarjetas visibles | 1440×900 | Parcialmente auditado |
| Habitaciones | Sí | filtros, búsqueda, formulario, detalles expandibles, crear, bloquear, editar/desactivar visibles | 1440×900 | Parcialmente auditado |
| Reservas Airbnb | Sí | buscador, tarjetas, campo de nombre y guardado visibles | 1440×900 | Parcialmente auditado |
| Importar | Sí | paneles, carga, respaldo, tabla, exportaciones y guías visibles | 1440×900 | Parcialmente auditado |
| Cuenta de cobro | Sí | rango, actualización, exportaciones, parámetros, resumen y tabla | 1440×900 | Parcialmente auditado |
| Navegación móvil | Sí | barra inferior y menú Más | 390×844 | Auditado |

## 3. Inventario propio

Probados u observados de forma directa: 8 ítems de navegación desktop; 5 ítems de navegación móvil y sus 5 opciones de Más; controles de periodo; 2 búsquedas de calendario; filtros por canal/estado; acciones Nueva reserva, Bloquear habitación, Disponibilidad y Resumen; formulario de reserva (66 opciones de habitación, datos de huésped, fechas/noches, pagos, canal, checks, adjunto y observaciones); 5 KPI de Hoy desktop y 3 móviles; accesos rápidos; 4 KPI y filtros de Limpieza; tarjetas y acciones de detalle de limpieza; filtros, formulario y tarjetas de Habitaciones; filtros/tabla y exportación del Dashboard; buscador, tarjetas/campos por fila de Airbnb; 5 secciones de importación y tabla de respaldos; parámetros, checkboxes por fila, tabla y exportaciones de Cuenta de cobro.

No se activaron acciones que cambian datos existentes: editar/desactivar habitación, actualizar nombre Airbnb, limpiar/marcar habitación, generar respaldo, importar, exportar ni seleccionar remisiones. Se abrieron controles de lectura y el modal de reserva.

## 4. Hallazgos

### [P1-VIS-01] La barra de acciones del calendario no conserva todos sus controles a 1440 px

**Severidad:** Alta  
**Categoría:** Layout, toolbar y densidad  
**Ruta:** Calendario  
**Sección:** Cabecera y filtros  
**Resolución:** 1440×900  
**Zoom:** 100 %  
**Elemento afectado:** Sincronizar Airbnb y bloque superior de controles  
**Descripción:** Tras título, selector mensual, flechas, rango, Nueva reserva y Bloquear habitación, el control Sinc. termina recortado en el borde derecho. La fila siguiente contiene además dos búsquedas, filtros de canal, Estado, Más y acciones auxiliares.  
**Pasos para reproducir:** Abrir Calendario con el panel Resumen visible a 1440×900.  
**Resultado actual:** La última acción pierde contenido y la jerarquía es una cadena continua de controles.  
**Resultado esperado:** Cada acción queda completa, con prioridad y agrupación inequívocas.  
**Impacto:** Una acción operativa se lee parcialmente y el calendario parece más complejo de lo necesario.  
**Recomendación concreta:** Separar navegación temporal, acciones de reserva y sincronización en grupos; permitir wrap controlado o mover Sinc. a una fila de acciones secundaria antes de que se produzca clipping. Reservar ancho mínimo para el texto de última sincronización.  
**Criterios de aceptación:** A 1440 px y zoom 100 %, todos los botones muestran icono y texto completos; la búsqueda/filtros no desplazan ninguna acción; cada grupo tiene un espaciado uniforme.  
**Evidencia:** `evidencias/pasada-1/calendario-controles-1440x900-densidad-acciones.png`.

### [P1-VIS-02] Los módulos comparten marca, pero no un mismo patrón de página

**Severidad:** Media  
**Categoría:** Sistema visual, contenedores y tipografía  
**Ruta:** Hoy, Calendario, Limpieza, Dashboard, Habitaciones e Importar  
**Sección:** Shell, cabeceras y paneles principales  
**Resolución:** 1440×900  
**Zoom:** 100 %  
**Elemento afectado:** Cabeceras, sidebar, paneles y títulos  
**Descripción:** Hoy usa una cabecera tarjeta; Limpieza una zona operacional sin contenedor de cabecera; Dashboard usa composición propia; Importar adopta hero de texto mucho más pequeño y con tipografía diferente. La barra lateral también cambia anchura y tratamiento entre vistas.  
**Pasos para reproducir:** Navegar consecutivamente entre Hoy, Limpieza, Dashboard, Habitaciones e Importar.  
**Resultado actual:** El usuario percibe varias aplicaciones emparentadas, no variantes de una misma superficie administrativa.  
**Resultado esperado:** Cada módulo puede tener su contenido propio, conservando una estructura estable de sidebar, contenedor, eyebrow, H1, subtítulo y espaciado vertical.  
**Impacto:** Aumenta la carga de reorientación y dificulta reconocer prioridades equivalentes.  
**Recomendación concreta:** Definir variantes reutilizables `PageHeader`, `ContentSurface` y `Sidebar` con ancho, padding, border-radius, sombra y escala tipográfica explícitos; limitar las excepciones a contenidos operativos que lo justifiquen.  
**Criterios de aceptación:** Los módulos conservan una posición y escala consistentes para marca, H1, subtítulo y contenido principal, sin perder sus herramientas específicas.  
**Evidencia:** `habitaciones-1440x900-dos-patrones-formulario-listado.png`, `limpieza-1440x900-patron-visual-independiente.png`, `importar-1440x900-paneles-tabla.png`.

### [P1-VIS-03] La experiencia de Hoy cambia de composición y jerarquía, no solo de breakpoint

**Severidad:** Media  
**Categoría:** Consistencia entre variantes  
**Ruta:** Hoy  
**Sección:** Encabezado, métricas y contenido inicial  
**Resolución:** 1440×900 y 390×844  
**Zoom:** 100 %  
**Elemento afectado:** KPI, título, resumen y navegación  
**Descripción:** Desktop muestra cinco KPI y múltiples paneles/reservas; móvil presenta tres KPI grandes, “Pendientes de hoy” y accesos rápidos. La adaptación es legible, pero sus prioridades visuales, escala de título y patrón de contenido no mapean claramente uno a uno.  
**Pasos para reproducir:** Comparar Hoy en ambas resoluciones.  
**Resultado actual:** Se requiere reaprender qué información representa la vista en cada formato.  
**Resultado esperado:** Móvil puede resumir, pero debe mantener el mismo orden semántico de métricas y ofrecer una pista clara para las secciones omitidas.  
**Impacto:** Inconsistencia perceptiva al alternar dispositivos.  
**Recomendación concreta:** Documentar una jerarquía canónica de Hoy y aplicar la misma escala semántica de KPI; si se ocultan métricas, incluir acceso rotulado a “ver resumen completo” en vez de sustituir el bloque por otra taxonomía.  
**Criterios de aceptación:** Los primeros KPI y la acción primaria son reconocibles y equivalentes en ambos formatos; las secciones no visibles tienen una vía explícita.  
**Evidencia:** `hoy-390x844-jerarquia-movil-distinta.png`.

### [P1-VIS-04] El calendario pierde escaneabilidad por celdas y badges demasiado comprimidos

**Severidad:** Media  
**Categoría:** Calendario, tipografía y densidad  
**Ruta:** Calendario  
**Sección:** Grilla de habitaciones y reservas  
**Resolución:** 1440×900  
**Zoom:** 100 %  
**Elemento afectado:** Chips de reserva, nombres y panel lateral  
**Descripción:** En la grilla de 66 habitaciones, numerosos chips muestran nombres y códigos truncados a pocos caracteres, mientras la tarjeta lateral conserva mucha información. Los tamaños de texto resultan heterogéneos frente a las tarjetas de habitaciones y limpieza.  
**Pasos para reproducir:** Abrir Calendario con reservas y Resumen activo.  
**Resultado actual:** Hay muchas marcas de estado compitiendo por espacio y se dificulta identificar una reserva sin pasar al panel lateral.  
**Resultado esperado:** Los chips priorizan canal/estado/identificador corto y usan un patrón consistente para detalle progresivo.  
**Impacto:** Reduce la lectura rápida de disponibilidad, objetivo central del calendario.  
**Recomendación concreta:** Crear una variante compacta de reserva para calendario: una línea con identificador estable, color semántico y truncado uniforme; reservar el nombre, total y código completo para tooltip/panel lateral.  
**Criterios de aceptación:** Ningún chip mezcla tres jerarquías tipográficas; los chips de igual estado tienen altura/padding/color idénticos; el detalle completo permanece disponible sin agrandar la celda.  
**Evidencia:** `calendario-controles-1440x900-densidad-acciones.png`.

### [P1-VIS-05] El modal de reserva usa una densidad y ornamentación ajenas al resto de formularios

**Severidad:** Media  
**Categoría:** Modal, formulario y tarjetas  
**Ruta:** Calendario → Nueva reserva  
**Sección:** Modal de creación  
**Resolución:** 1440×900  
**Zoom:** 100 %  
**Elemento afectado:** Header, resumen de tres tarjetas, selector de habitación y footer  
**Descripción:** El modal incorpora una hero degradada, icono circular, tres tarjetas de resumen, cuatro grandes paneles internos y footer sticky. Habitaciones usa en cambio un formulario plano de una sola superficie. Ambos son formularios administrativos, pero su ritmo, padding y jerarquía no coinciden.  
**Pasos para reproducir:** Calendario → Nueva reserva.  
**Resultado actual:** El primer pliegue consume gran parte de la altura en decoración/resumen; los campos de estancia y pagos quedan por debajo de una zona de scroll interna.  
**Resultado esperado:** El resumen debe informar sin competir con los campos y adoptar la misma variante de sección que los formularios de la aplicación.  
**Impacto:** La variación de patrón hace más costosa la exploración y complica escanear una tarea transaccional.  
**Recomendación concreta:** Extraer un `FormSection` y una `FormSummary` compartidos; reducir la hero a título/subtítulo y condensar el resumen en una tira de metadatos. Conservar el footer sticky, pero alinear sus alturas y botones con el estándar global.  
**Criterios de aceptación:** A 1440×900 se ven título, selección de habitación, huésped y estancia sin perder claridad; campos, selects y botones comparten altura/radio con Habitaciones.  
**Evidencia:** `reservas-modal-1440x900-jerarquia-formulario.png`.

### [P1-VIS-06] Habitaciones mezcla formulario horizontal, acordeones y tarjetas sin una escala única

**Severidad:** Media  
**Categoría:** Formularios, tarjetas y acciones  
**Ruta:** Habitaciones  
**Sección:** Crear habitación y listado  
**Resolución:** 1440×900  
**Zoom:** 100 %  
**Elemento afectado:** Inputs, acordeones, botones de guardar/bloquear y cards  
**Descripción:** El formulario de crear utiliza inputs muy compactos en una fila de seis columnas, dos acordeones de ancho completo y acciones alineadas al extremo. Debajo, las tarjetas manejan botones secundarios de apariencia distinta. La densidad difiere de la reserva y de limpieza.  
**Pasos para reproducir:** Abrir Habitaciones.  
**Resultado actual:** La lectura salta entre mini-inputs, barras de detalle y tarjetas; las acciones no se perciben como parte de una familia única.  
**Resultado esperado:** Formulario, expansores y cards aplican una escala consistente de control y acción.  
**Impacto:** Menor previsibilidad al administrar y crear habitaciones.  
**Recomendación concreta:** Establecer alturas de input/select y botones; convertir los detalles en acordeones con el mismo header que otros paneles; dar a Editar/Desactivar un tratamiento estándar de acción secundaria/peligrosa.  
**Criterios de aceptación:** Todos los campos de administración tienen la misma altura, labels y separación; acciones equivalentes conservan ancho mínimo, borde y color semántico.  
**Evidencia:** `habitaciones-1440x900-dos-patrones-formulario-listado.png`.

### [P1-VIS-07] Importar usa un hero sobredimensionado y una tabla sin jerarquía proporcional

**Severidad:** Media  
**Categoría:** Tipografía, tablas y paneles  
**Ruta:** Importar  
**Sección:** Respaldos seguros  
**Resolución:** 1440×900  
**Zoom:** 100 %  
**Elemento afectado:** Hero, tabla de backups y paneles desplegables  
**Descripción:** La hero ocupa una banda amplia para dos líneas pequeñas, mientras la tabla técnica inferior concentra nombres largos, tipo, tamaño y estado con igual peso visual. Esto contrasta con la cabecera más informativa de Habitaciones.  
**Pasos para reproducir:** Abrir Importar.  
**Resultado actual:** Hay espacio vacío en la parte superior y poca diferenciación para los datos operativos principales de la tabla.  
**Resultado esperado:** El título debe justificar su superficie y la tabla debe priorizar fecha/estado, contener nombres técnicos y mantener un patrón de panel reutilizable.  
**Impacto:** El módulo parece de otra familia y sacrifica área útil.  
**Recomendación concreta:** Reducir altura de hero o incorporar metadatos/acciones relevantes; definir anchos de columna y truncado con tooltip para Archivo; usar badge semántico para Estado.  
**Criterios de aceptación:** El primer pliegue muestra título, acción de respaldo y encabezado de tabla sin espacio inerte; archivos largos no fuerzan una lectura horizontal desigual.  
**Evidencia:** `importar-1440x900-paneles-tabla.png`.

### [P1-VIS-08] El conjunto de iconos/colores de estado no tiene una correspondencia uniforme entre módulos

**Severidad:** Baja  
**Categoría:** Iconografía y color semántico  
**Ruta:** Hoy, Limpieza, Habitaciones, Dashboard y Calendario  
**Sección:** KPI, filtros, canales y estados  
**Resolución:** 1440×900 y 390×844  
**Zoom:** 100 %  
**Elemento afectado:** Iconos de KPI, puntos de habitación, badges de canal y botones de filtro  
**Descripción:** Verde, violeta, naranja y rojo se reutilizan con varios significados (métrica, disponibilidad, acción o alerta); los contenedores de icono alternan círculo, cuadrado redondeado y ausencia de fondo.  
**Pasos para reproducir:** Comparar KPI de Hoy/Limpieza/Dashboard y estados de habitaciones/calendario.  
**Resultado actual:** La marca es consistente, pero no el contrato semántico de color ni el tratamiento de icono.  
**Resultado esperado:** Los colores semánticos y contenedores de icono deben expresar el mismo tipo de información.  
**Impacto:** Detalle de pulido y menor aprendizaje visual acumulativo.  
**Recomendación concreta:** Documentar tokens de `success`, `warning`, `danger`, `info`, canal Airbnb y canal WhatsApp; ofrecer variantes de icon tile en tamaño único para KPI.  
**Criterios de aceptación:** Un estado no cambia de significado según módulo; iconos equivalentes usan tamaño, fondo y contraste compatibles.  
**Evidencia:** `limpieza-1440x900-patron-visual-independiente.png`, `hoy-390x844-jerarquia-movil-distinta.png`.

## 5. Componentes inconsistentes

| Familia que debe compartir variante | Instancias observadas | Normalización propuesta |
| --- | --- | --- |
| Shell de página | Hoy, Limpieza, Dashboard, Habitaciones, Importar | Sidebar, ancho de contenido, PageHeader y espaciado vertical comunes. |
| KPI | Hoy (desktop/móvil), Limpieza, Dashboard, Habitaciones | Una card base con variantes de métrica; icon tile y texto de tendencia/ayuda normalizados. |
| Formularios | Nueva reserva, Crear habitación, Parámetros de cuenta | Label/input/select, grid, sección, error y footer de acción compartidos. |
| Paneles/tarjetas | Resumen diario, cards de habitación, detalle de limpieza, work panels, panel lateral de calendario | Radio, borde, sombra, padding y encabezado por variantes explícitas. |
| Toolbars/filtros | Calendario, Habitaciones, Limpieza, Dashboard | Grupos de navegación, búsqueda, filtros y acciones con prioridad responsive documentada. |
| Estados y badges | Calendario, Limpieza, Habitaciones, Dashboard | Tokens de color, tamaño, icono y texto semántico por canal/estado. |

## 6. Datos de prueba

- Registros creados: ninguno.
- Registros editados: ninguno.
- Registros eliminados: ninguno.
- Registros no eliminados: ninguno.
- Se abrió el formulario con el identificador previsto `AUDITORIA-UI-RESERVA-P1-001` y se introdujeron datos sintéticos. Al intentar guardar el formulario no se cerró y mantuvo un aviso de validación de fechas; se cerró sin que se insertara una reserva.
- Comprobación final read-only en SQLite: no hay `reservations.nombre_completo_huesped LIKE 'AUDITORIA-UI-%'`.
- Confirmación: no se modificaron datos reales, habitaciones, usuarios, credenciales, configuración ni archivos de aplicación.

## 7. Limitaciones

- La instancia inicialmente indicada en 5173 no respondía; se usó 5174, confirmada por el orquestador, con API 3001.
- El guardado de la reserva P1 no completó, por lo que no fue posible verificar visualmente su detalle, edición, representación en calendario ni eliminación. El intento no dejó datos sintéticos.
- No se accionaron operaciones mutantes sobre datos existentes (limpieza, habitación, nombres Airbnb, importación, exportación de cuenta, backup ni remisiones), por seguridad.
- Esta pasada privilegia consistencia visual; no sustituye la matriz exhaustiva de breakpoints, zoom, teclado y estados de la pasada responsive/interacción.

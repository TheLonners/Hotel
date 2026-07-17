# Auditoría UI consolidada

Fecha de consolidación: 2026-07-16  
Fuentes: `pasada-1-consistencia.md` (P1), `pasada-2-responsive.md` (P2) y `pasada-3-interaccion.md` (P3). Esta consolidación no modificó código, configuración ni datos, ni repitió la auditoría visual.

## 1. Resumen ejecutivo

La aplicación tiene una identidad reconocible —paleta verde, iconografía lineal y tarjetas operativas legibles— y el shell no presentó desbordamiento horizontal documental en Habitaciones a las once resoluciones medidas por P2. Sin embargo, la consistencia visual global es media: las cabeceras, paneles, formularios y KPI cambian de patrón entre módulos que realizan tareas administrativas equivalentes.

La intervención más urgente está en el modal de Nueva reserva. P2 confirmó que en móvil horizontal de 640 × 360 el encabezado y el pie fijo dejan el formulario muy comprimido, y que en 360 × 640 coexisten scrolls verticales. P1, además, observó una jerarquía demasiado ornamentada y densa para ese formulario en escritorio. El calendario también requiere reordenar su toolbar: a 1440 × 900 la acción de sincronización queda recortada.

No se ha demostrado cobertura responsive completa. P2 verificó Habitaciones en once tamaños, pero solo abrió el flujo de reserva; P1 revisó los módulos principales de la shell de forma parcial; P3 no consiguió control visual y sus cuatro resultados se conservan como **riesgos estáticos por confirmar**, no como defectos visuales validados. Ningún módulo completó el flujo sintético crear–editar–eliminar de reservas.

Aspectos que ya funcionan correctamente, con la evidencia disponible:

- La navegación móvil y el menú Más permanecieron dentro del viewport en las pantallas probadas por P2.
- En Habitaciones, el documento no tuvo overflow horizontal en las once resoluciones medidas por P2.
- El modal de reserva conserva acciones Cancelar y Guardar visibles en las capturas de P2.
- P3 identificó en código foco visible global, avisos raíz con `role=status`/`role=alert` y un contrato de foco más completo para `ReservationModal`; requieren validación en vivo antes de declararlos aprobados.

La severidad se consolidó según evidencia y bloqueo: los problemas que dificultan un flujo principal o recortan una acción se mantienen como altos. Los problemas de sistema visual, densidad o jerarquía se mantienen como medios. Los cuatro hallazgos de P3 no se elevaron por su posible impacto: son riesgos estáticos con severidad propuesta, condicionados a una repetición visual y de teclado.

## 2. Cobertura global

### Rutas y módulos

La aplicación es una shell con vistas internas, no una colección de URL independientes. Los informes identifican dos URL: `/` (shell) y `/sistema-ui`.

| Elemento de cobertura | Resultado basado en inventario real |
| --- | --- |
| URL identificadas | 2: `/` y `/sistema-ui` |
| URL cargada y auditada visualmente | 1: `/` |
| URL no abierta | 1: `/sistema-ui` |
| Vistas internas identificadas | 9: Hoy, Calendario, Limpieza, Dashboard, Habitaciones, Reservas Airbnb, Sincronización Airbnb, Importar y Cuenta de cobro |
| Vistas internas visitadas visualmente por al menos una pasada | 9, todas por P1; su estado es parcial |
| Vistas internas con verificación responsive medida | 3: Hoy, Calendario y Habitaciones |
| Vistas internas no auditadas visualmente por P2 | 6: Limpieza, Dashboard, Reservas Airbnb, Importar, Cuenta de cobro y Sincronización Airbnb |
| Vistas internas con auditoría completa de interacciones/estados | 0 |
| Flujo de reserva crear–editar–eliminar completado | 0 |

### Controles y flujos

No es posible obtener un total numérico único y fiable de botones o controles: P1 y P2 inventariaron grupos, controles y opciones, pero no numeraron todos los elementos; P3 registró explícitamente **0 controles probados en UI**. Para no inventar una cifra, se conserva el siguiente mínimo cuantificado y el alcance cualitativo:

| Elemento | Cobertura registrada |
| --- | --- |
| Navegación cuantificada por P1 | 8 opciones desktop, 5 opciones de barra móvil y 5 opciones en Más; se activaron/recorrieron según su informe |
| Opciones de habitación vistas en formulario P1 | 66 opciones |
| Búsquedas cuantificadas en Calendario por P1 | 2 |
| KPI cuantificados | 5 en Hoy desktop, 3 en Hoy móvil y 4 en Limpieza; observados, no todos representan acciones |
| Controles interactivos probados con recuento exacto en P3 | 0 |
| Formularios abiertos | Modal Nueva reserva (P1 y P2); formulario de Habitaciones y otros controles fueron inspeccionados/visibles en P1, sin escritura |
| Flujos de datos completados | 0; P1 intentó guardar una reserva sintética sin inserción y P2 no envió el formulario |
| Resoluciones verificadas | 11 en Habitaciones: 360×640, 375×667, 390×844, 412×915, 768×1024, 820×1180, 1280×720, 1366×768, 1440×900, 1920×1080 y 2560×1440; además Calendario/modal en 640×360 y 360×640. Todas a 100 % |
| Zoom no comprobado | 80 %, 125 % y 150 % |
| Estados no comprobados en vivo | hover, focus, active, disabled, loading, error, éxito, vacío, sin resultados, click fuera, Escape/Enter, atrás, persistencia de filtros, cargas y exportaciones |

Ningún elemento se considera aprobado solo por haber sido visible. La cobertura parcial de P1/P2 y la ausencia de P3 obligan a repetir la auditoría funcional antes de implementar cambios de riesgo alto sobre reservas o accesibilidad.

## 3. Matriz consolidada

| ID | Hallazgo | Ruta | Resolución | Severidad | Detectado por | Impacto | Solución | Esfuerzo |
| -- | -------- | ---- | ---------- | --------- | ------------- | ------- | -------- | -------- |
| C-01 | Toolbar del calendario recorta Sincronizar y acumula controles | `/` → Calendario | 1440×900, 100 % | Alta | P1 | Reduce acceso a una acción operativa y escaneabilidad | Agrupar navegación temporal, reservas y sincronización; permitir wrap o segunda fila antes del clipping | Medio |
| C-02 | Patrones de shell, cabecera y contenedor varían sin regla común | `/` → Hoy, Calendario, Limpieza, Dashboard, Habitaciones, Importar | 1440×900, 100 % | Media | P1 | Reorientación costosa entre módulos | Establecer `PageHeader`, `ContentSurface` y `Sidebar` con tokens y variantes | Alto |
| C-03 | Hoy cambia jerarquía semántica entre desktop y móvil | `/` → Hoy | 1440×900; 390×844, 100 % | Media | P1 | Requiere reaprender prioridades entre dispositivos | Definir orden canónico de KPI y acceso a secciones resumidas | Medio |
| C-04 | Grilla de calendario densa; chips y nombres truncados | `/` → Calendario | 1440×900, 100 % | Media | P1 | Dificulta leer disponibilidad y reserva | Variante compacta de chip con identificador, estado y detalle progresivo | Medio |
| C-05 | Modal de reserva ornamentado y denso frente a otros formularios | `/` → Calendario | 1440×900, 100 % | Media | P1 | Campos principales quedan fuera del primer pliegue y el patrón no es predecible | Compartir `FormSection`/`FormSummary`; reducir hero y normalizar footer | Medio |
| C-06 | Habitaciones mezcla controles y tarjetas con escalas diferentes | `/` → Habitaciones | 1440×900, 100 % | Media | P1 | Menor previsibilidad al crear y gestionar habitaciones | Normalizar altura/labels/acciones y headers de acordeón | Medio |
| C-07 | Importar dedica espacio excesivo al hero y jerarquiza poco su tabla | `/` → Importar | 1440×900, 100 % | Media | P1 | Menos área útil y lectura técnica desigual | Compactar cabecera; fijar anchos, truncado con tooltip y badge de estado | Bajo |
| C-08 | Significado de colores e icon tiles no es uniforme | Múltiples vistas | 1440×900; 390×844, 100 % | Baja | P1 | Aprendizaje visual acumulativo menor | Definir tokens semánticos y una variante de icono KPI | Medio |
| C-09 | Nueva reserva queda excesivamente comprimida en móvil horizontal | `/` → Calendario | 640×360, 100 % | Alta | P2 | Dificulta completar un flujo de reserva principal | Variante compacta para altura ≤480 px; cabecera/pie reducidos y cuerpo `100dvh` con un scroll | Medio |
| C-10 | Nueva reserva tiene scroll vertical anidado en móvil | `/` → Calendario | 360×640, 100 % | Media | P2 | Gestos confusos en el primer paso del formulario | Un solo scroll base; selector de habitación aislado y cerrable | Medio |
| C-11* | Diálogos secundarios pueden no contener/restaurar foco ni cerrar con Escape | Calendario, reservas, Hoy/Limpieza móvil | No verificada | Alta propuesta | P3 | Riesgo de pérdida de contexto y operación del fondo con teclado | Extraer wrapper de diálogo y probar Tab/Shift+Tab/Escape/foco devuelto | Alto |
| C-12* | Gestión de feeds Airbnb no tendría entrada desktop visible | `/` → Sincronización Airbnb | No verificada | Media propuesta | P3 | Posible función operativa oculta en escritorio | Confirmar navegación y añadir entrada/submenú diferenciado si falta | Bajo |
| C-13* | Filas de huéspedes del dashboard serían clicables solo con ratón | `/` → Dashboard | No verificada | Media propuesta | P3 | Riesgo de inaccesibilidad por teclado para abrir detalle | Confirmar en vivo y usar botón/enlace por fila o patrón teclado completo | Bajo |
| C-14* | Errores locales de bloqueo/disponibilidad podrían no anunciarse | `/` → Calendario/bloqueos | No verificada | Media propuesta | P3 | Riesgo de que el feedback de error pase desapercibido | Confirmar con lector de pantalla; añadir `role=alert` si procede | Bajo |

\* Hallazgo derivado de revisión estática P3. No se cuenta como confirmación visual ni se debe implementar sin reproducir la condición indicada.

No hay duplicados exactos entre las pasadas. C-05, C-09 y C-10 afectan el mismo formulario, pero describen causas distintas (jerarquía desktop, poca altura horizontal y scroll anidado vertical), por lo que se conservan como trabajos coordinados. Ningún hallazgo fue encontrado por dos o tres pasadas de forma independiente.

## 4. Cambios prioritarios

### Prioridad inmediata

1. **C-09 — Modal de Nueva reserva en 640×360.** Evita que una tarea central quede tan comprimida que se vuelva difícil de completar.
2. **C-01 — Toolbar del calendario a 1440×900.** El clipping de Sincronizar es una regresión visible de una acción operativa.
3. **Verificar C-11 antes de corregir.** Ejecutar una pasada de teclado sobre cada diálogo. Si se confirma, tratarlo como bloqueo de accesibilidad y corregirlo antes de ampliar modales.

### Prioridad alta

1. **C-10 — Scroll anidado del selector de habitación.** Debe resolverse junto con C-09, sin alterar reglas de disponibilidad ni el flujo Airbnb/directa.
2. **C-04 — Densidad del calendario.** Prioriza disponibilidad, estado e identificador corto sin ocultar el detalle.
3. **C-05 — Jerarquía del formulario.** Ajustar después de proteger la funcionalidad y responsive del modal.
4. **Verificar C-13 y C-14.** Son riesgos accesibles concretos, pero aún no resultados en vivo.

### Prioridad media

1. **C-02, C-03 y C-06.** Estandarizar shell, KPI, formularios y tarjetas con variantes explícitas.
2. **C-12.** Confirmar que la gestión Airbnb sea alcanzable en escritorio; corregir navegación solo si la comprobación lo confirma.
3. **C-07.** Mejorar jerarquía de Importar y tabla de respaldos.

### Pulido posterior

1. **C-08.** Consolidar tokens de iconos y colores semánticos una vez decididas las variantes de componente.
2. Repetir los estados y módulos no cubiertos antes de cambios puramente cosméticos.

## 5. Correcciones rápidas

Estas acciones son acotadas, pero deben realizarse después de una prueba de regresión de reserva/calendario:

| Hallazgo | Cambio concreto | Validación |
| --- | --- | --- |
| C-01 | Definir grupos de toolbar, ancho mínimo de Sincronizar y wrap/segunda fila antes de 1440 px | A 1440×900 no hay texto o icono recortado; filtros no desplazan acciones |
| C-07 | Reducir altura del hero de Importar; truncar archivo técnico con tooltip; priorizar fecha/estado | Primer pliegue contiene título, acción principal y cabecera de tabla |
| C-08 | Aplicar tokens de éxito, alerta, peligro, información, Airbnb y WhatsApp; unificar tamaño del icon tile KPI | Un estado conserva significado, contraste y tamaño entre módulos |
| C-06 | Fijar altura de input/select/botón y ancho mínimo de acciones secundarias/peligrosas | Crear Habitación y sus tarjetas usan el mismo ritmo de control |
| C-14* | Tras verificación, marcar los errores locales como alerta semántica sin cambiar el texto de API | Cada error se anuncia una sola vez y permanece junto al contexto |
| C-13* | Tras verificación, insertar una acción visible “Ver detalle” por fila de Dashboard | Tab, Enter y Espacio llegan al mismo detalle que el puntero |

## 6. Cambios estructurales

1. **Sistema de superficies.** C-02, C-05, C-06 y C-07 muestran que cabeceras, paneles, formularios y tarjetas equivalentes no comparten contrato. Crear componentes base y variantes, sin forzar que todas las pantallas sean idénticas.
2. **Arquitectura de toolbar responsive.** C-01 requiere que los grupos tengan prioridad semántica y breakpoints por ancho disponible, no una fila lineal de controles.
3. **Modal transaccional responsive.** C-05, C-09 y C-10 deben resolverse mediante una estructura flex de viewport, un área scrollable única y un selector de habitaciones explícitamente aislado. No cambiar la lógica de fechas, canal ni disponibilidad dentro de esta fase.
4. **Modelo de calendario compacto.** C-04 requiere una variante de badge/chip que separe la información para escaneo del detalle progresivo; evitar duplicar datos y tamaños de texto dentro de una celda.
5. **Navegación y contrato de diálogos accesibles.** C-11 y C-12 son propuestas condicionadas a verificación. De confirmarse, extraer un diálogo común y normalizar las entradas desktop/móvil a Sincronización Airbnb.
6. **Tablas accionables.** Si C-13 se confirma, las filas no deben ser el único objetivo de clic: cada registro debe ofrecer una acción semántica enfocables.

## 7. Propuesta de sistema visual

La propuesta se limita a reglas que resuelven los patrones observados; no constituye un rediseño de marca.

| Área | Regla propuesta | Justificación observada |
| --- | --- | --- |
| Espaciado | Escala 4, 8, 12, 16, 24, 32 px; padding de panel estándar 16 px compacto / 24 px escritorio | P1 detectó ritmo distinto entre tarjetas, heroes, formularios y paneles |
| Contenedores | `ContentSurface` con borde, radio y sombra compartidos; usar variante `flat` solo en vistas operativas justificadas | Hoy, Limpieza, Dashboard, Habitaciones e Importar parecen patrones diferentes |
| Tarjetas | KPI y tarjetas operativas comparten header, padding y altura mínima por variante, no igualdad forzada | KPI e icon tiles alternan entre módulos |
| Inputs y selects | Una altura base única para campo/select/botón de formulario; labels sobre el control y error junto al campo | P1 observó inputs compactos de Habitaciones frente al modal de reserva |
| Botones | Tamaño primario/secundario coherente; mínimo táctil de 44 px en móvil cuando el espacio lo permita; acciones destructivas con variante semántica | Acciones y botones cambian de tratamiento entre tarjetas y formularios |
| Tipografía | Escala de página: eyebrow, H1, subtítulo, título de sección, cuerpo y etiqueta; no introducir hero alto si solo contiene dos líneas | Importar usa demasiado espacio para poca información; P1 vio tamaños heterogéneos en calendario |
| Radios y sombras | Un radio base para paneles/campos y una sombra suave de superficie; reservar enfatización para diálogos | Modal de reserva está más ornamentado que otros formularios |
| Modales | Cabecera compactable, una única región scroll, footer con altura estable y reserva de `safe-area`; modo `max-height: 480px` | P2 confirmó compresión y scroll anidado; P1 detectó exceso de hero |
| Tablas | Columnas prioritarias, truncado consistente con tooltip, badges para estado y acción explícita por fila | Importar tiene jerarquía desigual; Dashboard tiene riesgo estático en filas clicables |
| Calendario | Chip de una línea: identificador corto + estado/canal; detalle completo en panel o tooltip; altura/padding uniforme | P1 confirmó chips densos y truncados |
| Breakpoints | Mantener las pruebas en 360, 390, 768, 1280, 1440 y 2560 px; añadir regla por altura ≤480 px para modales | P2 solo confirmó Habitaciones en la matriz completa y halló fallo por altura, no por ancho |
| Estados hover/focus/disabled/loading | Focus visible consistente; hover nunca es la única señal; disabled mantiene contraste legible; loading bloquea doble envío y explica la espera | Estados no fueron auditados en vivo; P3 halló patrones de accesibilidad que deben verificarse |
| Colores semánticos | Tokens separados para éxito, aviso, error, información, Airbnb y WhatsApp; no reutilizar un color para métrica y alerta sin etiqueta | P1 confirmó significados cambiantes de verde/violeta/naranja/rojo |

## 8. Plan de implementación para Codex

### Fase 1: bloqueos y errores críticos

- **Incluye:** C-09 y C-01; comprobación obligatoria de C-11, C-13 y C-14 antes de cualquier parche de accesibilidad.
- **Archivos/componentes probables:** `frontend/src/App.tsx`, `frontend/src/styles/app.css`; componentes de `ReservationModal`, toolbar del Calendario y los paneles de bloqueo/disponibilidad/detalle ya presentes en `App.tsx`.
- **Riesgos:** No alterar validaciones de fecha, disponibilidad, separación Airbnb/directa, guardado de reservas ni acciones que escriban en SQLite.
- **Dependencias:** Capturas/reproducción de los riesgos P3 con control de navegador funcional; datos sintéticos con prefijo individual y limpieza completa para probar guardado si es necesario.
- **Criterios de aceptación:** 640×360 muestra cabecera compacta, primer control útil y ambos botones; 1440×900 no recorta Sincronizar; los riesgos P3 quedan confirmados o descartados con evidencia.
- **Pruebas a repetir:** Nueva reserva en 360×640, 390×844, 640×360 y 1440×900; navegación/toolbar de calendario; Tab/Shift+Tab/Escape de cada diálogo si se confirma C-11.

### Fase 2: responsividad

- **Incluye:** C-10, consolidación de C-09 y la política de breakpoints/altura de modal.
- **Archivos/componentes probables:** `frontend/src/App.tsx`, `frontend/src/styles/app.css`, estilos del selector de habitación y footer del modal.
- **Riesgos:** El selector no debe ocultar habitaciones, capturar indebidamente el foco ni impedir cerrar/guardar; conservar el footer y safe-area.
- **Dependencias:** Resolver/confirmar Fase 1 y disponer de la matriz de viewport/zoom que faltó.
- **Criterios de aceptación:** Un único scroll principal en 360×640; selector aislado con cierre claro; no hay overflow horizontal en el modal ni botones tapados.
- **Pruebas a repetir:** 360×640, 375×667, 390×844, 412×915, 640×360, 768×1024; 80 %, 100 %, 125 % y 150 %; vertical y horizontal.

### Fase 3: estandarización de componentes

- **Incluye:** C-02, C-03, C-06 y C-08.
- **Archivos/componentes probables:** `frontend/src/App.tsx`, `frontend/src/styles/app.css`, componentes reutilizables existentes bajo `frontend/src/components/` si ya alojan tarjetas/controles; evitar migración masiva sin fases.
- **Riesgos:** Convertir superficies sin preservar acciones, estados, nombres de campo y orden de navegación; no asumir que una vista operativa debe usar un hero.
- **Dependencias:** Inventario de componentes y consumidores previo; acordar tokens y variantes antes de sustituir clases.
- **Criterios de aceptación:** Shell, header, cards KPI, campos y acciones equivalentes muestran tamaño/radio/espaciado coherentes; Hoy conserva la misma jerarquía semántica desktop/móvil.
- **Pruebas a repetir:** Hoy, Limpieza, Dashboard, Habitaciones e Importar a 390×844 y 1440×900; regresión de formularios existentes.

### Fase 4: formularios, tablas y calendario

- **Incluye:** C-04, C-05 y C-07.
- **Archivos/componentes probables:** `frontend/src/App.tsx`, `frontend/src/styles/app.css`, componentes de Calendar, ReservationModal, Habitaciones, Importar y tabla de respaldos.
- **Riesgos:** Ocultar información de reserva importante en chips; cambiar semántica de fechas, canal, saldo, comprobantes o formatos de exportación/importación.
- **Dependencias:** Tokens/componentes base de Fase 3 y datos de prueba aislados para validar detalle de reserva.
- **Criterios de aceptación:** Los chips conservan identificador y estado legibles, el detalle completo se recupera de forma explícita, y el primer pliegue de formularios/tablas prioriza tarea y estado.
- **Pruebas a repetir:** Calendario con contenido largo, Resumen abierto/cerrado, filtros activos, reservas Airbnb y directas; Importar con nombres largos; formulario crear/editar reserva sintética y limpieza posterior.

### Fase 5: accesibilidad y estados

- **Incluye:** C-11, C-12, C-13 y C-14 solo si se confirman en una pasada en vivo; estados hover/focus/disabled/loading/error/éxito que quedaron sin cobertura.
- **Archivos/componentes probables:** `frontend/src/App.tsx`, `frontend/src/styles/app.css`, navegación superior/sidebar, diálogos y avisos locales.
- **Riesgos:** Atrapar foco en un panel no modal o romper el retorno de foco; introducir avisos duplicados; cambiar rutas de navegación sin mantener la opción móvil.
- **Dependencias:** Evidencia visual/teclado de P3 repetida y decisión de patrón de diálogo compartido.
- **Criterios de aceptación:** Todos los diálogos confirmados contienen foco, cierran con Escape y devuelven foco; cada acción de tabla tiene ruta de teclado; errores se anuncian una vez; Sincronización Airbnb es alcanzable desktop/móvil si se confirma que faltaba.
- **Pruebas a repetir:** Teclado completo, lector de pantalla cuando esté disponible, click fuera, Enter, Escape, atrás, carga, error de API, éxito y doble envío.

### Fase 6: pulido visual

- **Incluye:** Ajustes restantes de C-07/C-08 y discrepancias menores que aparezcan en la repetición de cobertura.
- **Archivos/componentes probables:** Principalmente `frontend/src/styles/app.css` y componentes afectados por los cambios anteriores.
- **Riesgos:** Convertir preferencias estéticas en cambios de producto; introducir regresiones de contraste o responsive.
- **Dependencias:** Fases 1–5 estables, capturas de comparación y validación del usuario para decisiones de marca.
- **Criterios de aceptación:** No hay clipping, desalineación o espacio inerte material en las vistas auditadas; colores y estados son coherentes y contrastados.
- **Pruebas a repetir:** Matriz desktop/móvil, zoom completo, contenido corto/largo y diff visual de módulos equivalentes.

## 9. Checklist de verificación

Usar una sola opción por fila: **Cumple**, **No cumple** o **No aplica**.

| Verificación | Estado |
| --- | --- |
| A 1440×900, la toolbar del Calendario muestra completas todas las acciones, incluida Sincronizar | ☐ Cumple ☐ No cumple ☐ No aplica |
| A 640×360, Nueva reserva muestra cabecera compacta, primer control útil y ambos botones sin solapamiento | ☐ Cumple ☐ No cumple ☐ No aplica |
| A 360×640, el modal de reserva tiene una sola región de scroll principal | ☐ Cumple ☐ No cumple ☐ No aplica |
| El selector de habitación se abre/cierra claramente y no deja scroll competidor | ☐ Cumple ☐ No cumple ☐ No aplica |
| Los chips de Calendario mantienen identificador y estado legibles sin mezclar jerarquías | ☐ Cumple ☐ No cumple ☐ No aplica |
| Hoy conserva el orden semántico de KPI y una vía a la información resumida entre desktop/móvil | ☐ Cumple ☐ No cumple ☐ No aplica |
| Headers, superficies, tarjetas, campos y acciones equivalentes usan variantes documentadas | ☐ Cumple ☐ No cumple ☐ No aplica |
| Los colores de estado/canal tienen el mismo significado y contraste en todos los módulos | ☐ Cumple ☐ No cumple ☐ No aplica |
| Importar prioriza acción, fecha y estado; nombres técnicos largos no rompen la tabla | ☐ Cumple ☐ No cumple ☐ No aplica |
| Cada diálogo verificado contiene foco, admite Shift+Tab, cierra con Escape y devuelve foco al invocador | ☐ Cumple ☐ No cumple ☐ No aplica |
| Cada error local verificado se anuncia y permanece próximo a la acción/campo relevante | ☐ Cumple ☐ No cumple ☐ No aplica |
| Las filas de Dashboard ofrecen una acción de detalle mediante teclado si su clic se confirma | ☐ Cumple ☐ No cumple ☐ No aplica |
| Sincronización Airbnb es alcanzable desde navegación desktop y móvil si se confirma la carencia | ☐ Cumple ☐ No cumple ☐ No aplica |
| Se prueban 360, 390, 768, 1280, 1440 y 2560 px, más 640×360, a 80/100/125/150 % | ☐ Cumple ☐ No cumple ☐ No aplica |
| Se prueban contenido corto/largo, sidebar/menú, click fuera, atrás, hover, focus, loading, error, éxito y vacío | ☐ Cumple ☐ No cumple ☐ No aplica |
| El flujo sintético de reserva crear–ver listado/calendario–editar–eliminar se completa y limpia solo los registros propios | ☐ Cumple ☐ No cumple ☐ No aplica |
| La regresión no modifica reservas, habitaciones, usuarios, configuración ni datos reales | ☐ Cumple ☐ No cumple ☐ No aplica |

## Estado de datos y evidencias

P1, P2 y P3 reportaron cero registros creados, editados o eliminados. P1 confirmó mediante comprobación read-only que no había reservas con `AUDITORIA-UI-`; P2 y P3 no escribieron en SQLite. Por tanto, no quedan datos sintéticos pendientes de limpieza según los tres informes.

Evidencias disponibles: P1 y P2 referencian sus PNG bajo `docs/auditoria-ui/evidencias/pasada-1/` y `docs/auditoria-ui/evidencias/pasada-2/`. La carpeta de P3 existe pero está vacía por el bloqueo de automatización. No se revisaron capturas adicionales en la consolidación porque no fue necesario resolver contradicciones.

## Limitaciones consolidadas

- `/sistema-ui` no se abrió. No hay auditoría visual íntegra de una ruta independiente distinta de la shell `/`.
- Ninguno de los nueve módulos internos completó todos sus estados, acciones, formularios, menús, diálogos, exportaciones, cargas ni el flujo de reserva solicitado.
- P2 no auditó visualmente Limpieza, Dashboard, Reservas Airbnb, Sincronización Airbnb, Importar ni Cuenta de cobro; P1 los visitó de forma parcial a 1440×900, sin activar acciones que mutan datos existentes.
- P3 no realizó inspección visual ni interacción en vivo. C-11 a C-14 son hipótesis estáticas y requieren repetición antes de implementar.
- Solo Habitaciones recibió la matriz completa de once resoluciones y solo a 100 %. Faltan zoom 80/125/150 %, orientaciones y contenido corto/largo para la mayoría de módulos.
- El guardado de la reserva sintética P1 no se completó por una validación de fechas; no se considera fallo confirmado sin una reproducción controlada. No hubo creación, edición ni eliminación de reservas sintéticas.

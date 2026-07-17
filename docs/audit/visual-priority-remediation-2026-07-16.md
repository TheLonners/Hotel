# Corrección de problemas visuales prioritarios — 2026-07-16

## Alcance e invariantes

Se corrigieron los problemas visuales prioritarios detectados en la auditoría sin cambiar rutas, contratos API, formatos CSV, fechas, disponibilidad ni la separación entre Airbnb y WhatsApp/directas. No se modificaron SQLite, uploads, backups, secretos ni dependencias.

| Pantalla/componente | Problema anterior | Cambio aplicado | Riesgo y control | Prioridad |
| --- | --- | --- | --- | --- |
| Habitaciones móvil | Tarjetas sin límite, desbordes y página de más de 13.000 px con datos reales | Lista inicial de 12 habitaciones con carga incremental; límites de ancho, wrapping y `overflow-x` acotado | La búsqueda y filtros siguen operando sobre la colección completa; solo cambia el render | Alta |
| Navegación móvil | La barra fija podía cubrir el final del contenido, especialmente en Limpieza | Reserva inferior con `safe-area` en el layout y en la referencia móvil de Limpieza | No cambia navegación ni orden de acciones | Alta |
| Nueva reserva | El foco escapaba al fondo y no se restauraba | Foco inicial en búsqueda de habitación, focus trap, hermanos `inert`, cierre con Escape y restauración del foco | La lógica de guardado no se tocó; Escape se bloquea durante guardado | Alta |
| Calendario desktop | 165 botones por habitación (~11.352 botones con el conjunto auditado) | Bloques de 90 días, filas estables y contención de layout/pintura fuera del viewport; sin actualizaciones de React durante el scroll vertical | Reservas, bloques, posiciones, fechas y nodos bajo el puntero permanecen estables | Alta |
| Reservas Airbnb | 293 tarjetas, inputs y botones simultáneos | 20 reservas iniciales con carga incremental y reinicio al buscar | Edición y búsqueda operan sobre todos los datos cargados | Alta |
| Sincronización Airbnb | Todos los feeds se renderizaban a la vez | 8 feeds iniciales con carga incremental | No cambia sincronización, activación ni eliminación | Media |
| Cuenta de cobro | Tabla completa producía páginas extensas | 25 remisiones iniciales con carga incremental | Cálculo, selección y exportación siguen usando todos los items, no solo los visibles | Alta |
| Limpieza | Acciones y badges contradecían estados `limpio`/`limpiando`; se mostraba canal WhatsApp sin operación | Acciones ya completadas quedan deshabilitadas y con texto de estado; badges derivan del estado real; canal solo se muestra si existe | No se agregaron transiciones nuevas ni se cambió la API | Alta |
| Controles táctiles | Algunos objetivos operativos eran menores de 44 px | Mínimo móvil de 44 px para botones, inputs, selects, summaries y controles de archivo; se excluyen celdas vacías del calendario oculto en móvil | Cambio visual acotado al breakpoint móvil | Media |
| Accesibilidad | Inputs de archivo, búsquedas, checkboxes de remisiones e iconos carecían de nombre | `aria-label`, `aria-pressed` y `aria-hidden` donde corresponde; labels implícitos existentes se conservaron | No se sustituyeron etiquetas visibles por placeholders | Alta |
| Codificación | Separadores visibles `Â·` | Reemplazo puntual de dos literales de interfaz por `·` | No se ejecutaron reemplazos sobre datos ni nombres de huéspedes | Media |

## Archivos

- `frontend/src/App.tsx`: optimización estable del calendario, accesibilidad del modal, listas incrementales, estados de Limpieza, labels y mojibake.
- `frontend/src/styles/app.css`: contención responsive, safe-area, targets táctiles y controles incrementales.
- `docs/audit/visual-priority-remediation-2026-07-16.md`: decisión y evidencia de fase.

## Comparación antes/después

| Área | Antes | Después |
| --- | --- | --- |
| Calendario | 165 días y todas las filas podían participar en el repintado | 90 días por bloque; las filas permanecen estables y el navegador omite layout y pintura fuera del viewport |
| Habitaciones | Todas las tarjetas en el DOM | 12 por tanda |
| Reservas Airbnb | Todas las reservas en el DOM | 20 por tanda |
| Feeds Airbnb | Todos los feeds en el DOM | 8 por tanda |
| Remisiones | Todas las filas en el DOM | 25 por tanda; totales/exportación conservan el conjunto completo |
| Modal de reserva | Fondo operable y foco sin contención | Fondo inert, foco inicial/contenido/restauración y Escape preservado |

## Validaciones

Baseline antes de editar:

- `git status --short`: limpio.
- `pnpm typecheck`: PASS.
- `pnpm build`: PASS.
- `pnpm --filter hotel-reservas-backend test:integrity`: PASS.

Durante los lotes:

- Typecheck tras calendario/modal: PASS.
- `git diff --check`, typecheck y build tras responsive, listas y Limpieza: PASS.
- La compilación final pasó con `/` de 42,7 kB y First Load JS de 145 kB (antes: 41,3 kB y 144 kB). El pequeño aumento corresponde a control de foco y listas incrementales; no se agregaron dependencias.
- Búsqueda estática de `Â·` y `�` en fuente UI/backend: sin coincidencias después del cambio.

## Validación visual y limitaciones

La app compilada respondió por HTTP `200` en `http://127.0.0.1:3001/`. Se intentó validar en 1440×900 y 390×844 con el navegador solicitado, pero el navegador interno no estuvo disponible en esta sesión y el navegador conectado agotó el tiempo de navegación tanto contra `:5173` como contra `:3001`. No se ejecutaron clicks de escritura ni se usó la SQLite operativa para pruebas destructivas.

Pendiente obligatorio antes de despliegue: repetir la inspección visual en 1440×900 y 390×844, confirmar el número real de `.day-slot`, ancho `scrollWidth/clientWidth` de Habitaciones, espacio sobre la barra inferior, recorrido Tab/Shift+Tab/Escape del modal y estados deshabilitados de Limpieza con una base temporal o flujo estrictamente de lectura.

## Rollback

Los cambios son reversibles por archivo y no requieren migración. Para revertir por lotes: retirar primero estilos responsive/incrementales, luego controles incrementales, y finalmente ventana del calendario/focus trap. No hay rollback de datos porque no hubo escrituras de datos.

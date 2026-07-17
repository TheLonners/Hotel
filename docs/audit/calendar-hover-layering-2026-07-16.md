# Ajuste de hover y capas del calendario — 2026-07-16

## Fase

Corrección incremental de la interfaz de calendario.

## Problema

Al pasar el cursor por una reserva, su tooltip debía mostrar los datos sin quedar cubierto por reservas vecinas. Además, al desplazar la cuadrícula, las barras de reserva podían superponerse al encabezado fijo de fechas.

## Decisión

- Se conserva la información de hover mediante el atributo nativo `title` de cada reserva, con huésped, total y saldo.
- El encabezado fijo de fechas tiene una capa superior a las reservas, por lo que los números de calendario no se pueden cubrir durante el desplazamiento. El tooltip activo es la excepción intencional: se muestra por encima de toda la cuadrícula mientras se pasa el cursor.
- Se mantiene la separación entre la etiqueta Airbnb y la reserva activa; no se modificaron reglas de disponibilidad ni datos.
- La regla de hover se declara después de la capa base de la reserva activa para evitar que esta última reduzca su prioridad por orden de CSS.
- Se restauró la contención de pintura de cada fila (`content-visibility: auto`). El tooltip CSS personalizado se retiró porque obligaba a desactivar esa optimización y provocaba repintados costosos al desplazar la grilla.

## Riesgo y validación

El cambio se limita a markup accesible y CSS. Validar con `pnpm.cmd typecheck`, `pnpm.cmd build` y revisión de diff; probar el hover y la apertura por clic en la cuadrícula de calendario.

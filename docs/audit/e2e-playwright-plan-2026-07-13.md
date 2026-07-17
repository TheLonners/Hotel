# Plan E2E Playwright — 2026-07-13

## Estado

Playwright no está instalado en raíz, frontend ni backend; tampoco hay scripts `e2e`, `test` o specs existentes. No se agregaron dependencias ni configuración en esta fase porque todavía falta definir un servidor de pruebas y fixtures aislados de `data/hotel.sqlite`.

## Instalación propuesta

Con autorización del mantenedor:

```powershell
pnpm --filter hotel-reservas-frontend add -D @playwright/test
pnpm exec playwright install chromium
```

Después se debe añadir un script `e2e` al manifest elegido y configurar `baseURL`, servidores y datos de prueba. No ejecutar sobre la base operativa.

## Matriz de cobertura

| Flujo | Spec propuesta | Datos aislados | Viewport | Estado |
|---|---|---|---|---|
| Login | `e2e/auth.spec.ts` | Usuario temporal en DB temporal | Desktop/móvil | Pendiente de instalación y UI de login verificable |
| Navegación/dashboard | `e2e/dashboard.spec.ts` | Seed mínimo temporal | Desktop/móvil | Pendiente |
| Crear/editar reserva WhatsApp | `e2e/reservations-whatsapp.spec.ts` | Habitación y huésped temporales | Desktop/móvil | Pendiente |
| Reservas Airbnb | `e2e/reservations-airbnb.spec.ts` | Reserva Airbnb temporal, sin mezclar canal | Desktop | Pendiente |
| Calendario | `e2e/calendar.spec.ts` | Reserva/bloqueo temporal | Desktop/móvil | Pendiente |
| Bloquear/liberar habitación | `e2e/blocks.spec.ts` | Habitación temporal | Desktop/móvil | Pendiente |
| Carga CSV | `e2e/import-csv.spec.ts` | Fixture CSV sin PII | Desktop | Pendiente |
| Responsive móvil | `e2e/mobile.spec.ts` | Fixture mínimo | 390x844 | Pendiente |

## Reglas de implementación

- Usar roles, labels y `data-testid` estables; no selectores por clases visuales.
- Esperar respuestas/estados visibles; no usar sleeps arbitrarios.
- Separar Airbnb y WhatsApp en fixtures, expectativas y nombres.
- Restaurar la DB temporal por test o worker; no usar `seed` contra `data/hotel.sqlite`.
- Capturar trazas solo sin datos personales.

## Bloqueo actual

La instalación/configuración requiere autorización y una decisión sobre el entorno de prueba. Hasta entonces, la cobertura E2E queda pendiente y no se declara como ejecutada.

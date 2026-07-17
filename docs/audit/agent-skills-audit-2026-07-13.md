# Auditoría integral de la app — 2026-07-13

## Alcance y método

Auditoría de solo lectura de la app real en `C:\Users\Nick-Victus\Documents\Hotel`, siguiendo `.agents/skills/webapp-audit`. Se revisaron `AGENTS.md`, `README.md`, manifests, configuración Next/TypeScript, frontend, backend, servicios, acceso SQLite y documentación existente en `docs/audit/`. No se modificaron archivos de aplicación ni datos SQLite durante esta fase.

La validación técnica se ejecutó sobre el checkout actual. Se consultó además el servidor local ya activo en `127.0.0.1:3001` sin imprimir respuestas con datos: `/api/health`, `/api/rooms` y `/` respondieron `200`.

## Resumen del estado actual

- La app es un monorepo pnpm con frontend Next.js 15/React 19/TypeScript y backend Express/Node.js con `node:sqlite`.
- El frontend usa una sola entrada cliente (`frontend/src/App.tsx`) que contiene la navegación y prácticamente todas las vistas, modales y formularios.
- El backend concentra rutas en `backend/src/server.js` y lógica de negocio en servicios separados. La base operativa es `data/hotel.sqlite`.
- Los flujos de reservas distinguen `origen_reserva` (`airbnb`/`whatsapp`) y la disponibilidad contempla la diferencia de bloqueos Airbnb frente a bloqueos manuales/eventos.
- Hay soporte de importación Excel/CSV, sincronización iCal Airbnb, exportaciones, dashboard, limpieza y comprobantes.
- Hay señales positivas: viewport móvil explícito, `lang="es"`, foco visible, límites de tamaño de upload, consultas parametrizadas en los servicios revisados, backup/integridad y validación de tipos/build.
- La app compila y el chequeo de integridad de reservas pasa; no existen scripts declarados de `lint`, `test` ni Lighthouse.

## Mapa de arquitectura y flujos

| Área | Ubicación principal | Observación |
|---|---|---|
| Shell y navegación | `frontend/src/App.tsx:145-430` | Estado global de vistas, cargas iniciales, menú móvil, paneles y modales. |
| Calendario | `frontend/src/App.tsx:541-1027` | Rejilla desktop, agenda móvil, filtros, disponibilidad y sincronización Airbnb. |
| Reservas | `frontend/src/App.tsx:1028-1585`, `backend/src/services/reservations.js` | Alta/edición, habitaciones, pagos, adjuntos y estados. |
| Dashboard | `frontend/src/App.tsx:2852-3217`, `backend/src/server.js:712-940` | Métricas y consultas por rango/canal. |
| Habitaciones/Airbnb | `frontend/src/App.tsx:3406-4000`, `backend/src/services/airbnbSync.js` | CRUD, iCal, detalles y separación de canal. |
| Importación CSV/Excel | `frontend/src/App.tsx:4116-4485`, `backend/src/services/importer.js`, `roomBulk.js` | Preview, confirmación, alertas y cargue de habitaciones. |
| Acceso a datos | `backend/src/database/db.js` | Creación/migraciones incrementales y `node:sqlite`. |

## Hallazgos priorizados

| Prioridad | Hallazgo | Evidencia/archivo | Impacto | Recomendación |
|---|---|---|---|---|
| Alta | Autenticación desactivada por defecto y todas las rutas API quedan con usuario admin local cuando `AUTH_ENABLED=false`. | `backend/src/server.js:72-101`, `backend/.env.example:10-14` | Cualquier cliente de la LAN puede operar reservas, datos y mutaciones si el servidor se expone así. | Mantener el modo local solo como decisión explícita; antes de exposición externa, activar auth y añadir una matriz de roles verificada por endpoint. |
| Alta | Autorización incompleta por rol: la mayoría de mutaciones de habitaciones, reservas, pagos, bloqueos, importaciones, limpieza y alertas no tienen `requireRole` explícito. | `backend/src/server.js:259-649`, `409-548`, `626-654`, `952-954` | Usuarios autenticados con rol limitado podrían ejecutar operaciones fuera de su permiso cuando auth esté activa. | Definir permisos por operación y cubrirlos con pruebas API/E2E; hacerlo en la fase de seguridad, no como refactor incidental. |
| Alta | La sesión usa `crypto.timingSafeEqual` sin validar longitudes antes de comparar la firma. | `backend/src/services/auth.js:40-49` | Un token malformado podría generar una excepción en vez de un `401` limpio. | Validar formato/longitud y encapsular la comparación; añadir prueba de token inválido. |
| Alta | El cliente guarda un password administrativo en `localStorage` y lo envía como `x-admin-password`. | `frontend/src/services/api.ts:7-8,107-109,128-130` | El secreto queda expuesto a XSS/extensiones y se replica en cada request. | Migrar a sesión con cookie segura/httpOnly o token corto; no imprimir ni migrar secretos reales durante el refactor. |
| Alta | El manejador global devuelve `err.message` y `err.details` directamente al cliente. | `backend/src/server.js:970-976` | Mensajes internos podrían revelar detalles de validación, integraciones o datos. | Usar errores públicos controlados, logging interno redactado y códigos correlacionables. |
| Media | `CORS_ORIGIN=*` es el valor de ejemplo y `cors` habilita cualquier origen cuando no se cambia. | `backend/src/server.js:80-81`, `backend/.env.example:7` | Aumenta la superficie de una API local si se publica fuera de la máquina. | Restringir origen en despliegues compartidos y documentar la configuración LAN segura. |
| Alta | El frontend cliente contiene todas las vistas en un módulo monolítico de aproximadamente 234 KB/4.485 líneas; la hoja principal tiene aproximadamente 198 KB/7.916 líneas. | `frontend/src/App.tsx`, `frontend/src/styles/app.css` | Coste de mantenimiento alto, riesgo de regresiones y poco margen para code splitting o auditorías aisladas. | Extraer por dominio en lotes: shell, calendario, reservas, dashboard, limpieza, Airbnb/importación; mantener contratos y hacer build tras cada lote. |
| Media | Cada cambio de mes, búsqueda o filtro del calendario dispara reservas, bloques y dashboard en paralelo; el dashboard no se limita al contexto de la vista. | `frontend/src/App.tsx:190-219,256-258` | Trabajo y datos innecesarios, especialmente con tablas/calendario grandes. | Separar loaders por vista y cachear/limitar consultas; medir antes y después sin cambiar resultados. |
| Media | La configuración usa `images.unoptimized=true`; el build es export estático y la app carga el módulo cliente completo. | `frontend/next.config.mjs`, `frontend/src/App.tsx` | Imágenes grandes y navegación menos eficiente en móvil. | Optimizar assets locales, usar lazy loading/dimensiones y evaluar división de vistas compatible con export estático. |
| Media | Hay 172 botones detectados y solo 32 declaran `type`; también hay tabs móviles “Día/Semana/Agenda” sin handlers visibles. | `frontend/src/App.tsx:516` y resto del módulo | Riesgo de comportamiento ambiguo en formularios futuros y controles visualmente interactivos sin efecto. | Añadir `type="button"` sistemáticamente donde corresponda y hacer funcionales o no interactivos los tabs. |
| Baja | La suite de pruebas E2E no está instalada/declarada y no existe script `lint`/`test`. | `package.json`, `frontend/package.json`, `backend/package.json` | Las regresiones de calendario, CSV y responsive dependen de pruebas manuales. | Proponer Playwright aislado con fixtures no operativos en la fase 8. |
| Baja | Se detectan candidatos de limpieza que requieren comprobación: `frontend/src/components/vm/interface-system.tsx` y algunos componentes UI no aparecen como imports de la app principal; varias dependencias solo aparecen en sus propios componentes. | `frontend/src/components/`, `frontend/src/app/sistema-ui/page.tsx` | Podría existir código de diseño intencionalmente aislado, no necesariamente muerto. | No borrar ahora; generar candidatos y confirmar rutas/dynamic imports en la fase 3. |

## Accesibilidad y responsive

Fortalezas verificadas: `html lang="es"`, viewport con `device-width`, `focus-visible` explícito en `frontend/src/styles/app.css:76-78`, menú móvil con `aria-expanded`/`aria-controls`, regiones de estado/error y múltiples labels/aria-labels.

Riesgos para validar en navegador: alta densidad del calendario y tablas, muchos controles sin `type`, tabs móviles no funcionales, modales con foco/trampa de foco no demostrada en inspección estática, y posible overflow en grids complejos. La hoja tiene varios bloques responsive y media queries, pero su tamaño y duplicación hacen difícil garantizar consistencia sin prueba por viewport.

## Rendimiento y Web Vitals

No se ejecutó Lighthouse porque no hay herramienta ni script declarado y no se añadió una dependencia en la auditoría. El build reportó:

| Ruta | First Load JS | Estado |
|---|---:|---|
| `/` | 143 kB | Build estático correcto; incluye la aplicación cliente monolítica. |
| `/_not-found` | 103 kB | Build correcto. |
| `/sistema-ui` | 126 kB | Build correcto. |

LCP/CLS/TBT no están medidos. Las causas probables a investigar son el módulo cliente único, imágenes sin optimización Next, consultas paralelas repetidas y CSS grande.

## Seguridad

No se explotaron vulnerabilidades ni se modificaron credenciales, `.env` o datos. Los hallazgos de alta prioridad son de configuración/flujo y requieren correcciones separadas, con pruebas y revisión de impacto.

## Plan por fases

1. **Limpieza segura:** confirmar candidatos de componentes/dependencias/estilos; eliminar solo imports y archivos demostrablemente huérfanos.
2. **Refactor seguro:** extraer dominios de `App.tsx` y CSS por lotes, comenzando por utilidades/componentes compartidos y sin tocar reglas de disponibilidad.
3. **Rendimiento:** separar cargas de dashboard/calendario, revisar imágenes y medir build/Lighthouse cuando la herramienta esté disponible.
4. **Responsive/accesibilidad:** corregir `type`, tabs, foco, overflow, tablas y modales con pruebas de viewport.
5. **Seguridad:** cerrar matriz de roles, comparar tokens robustamente, rediseñar almacenamiento de sesión, restringir CORS y sanitizar errores/uploads.
6. **Pruebas:** instalar/configurar Playwright solo con autorización, usar base/fixtures aislados y cubrir reservas Airbnb/WhatsApp por separado.

No avanzar una fase si falla typecheck/build o la integridad SQLite. Antes de cualquier escritura de datos, crear backup y verificar `PRAGMA integrity_check`/`foreign_key_check` mediante el script existente.

## Comandos ejecutados

| Comando | Resultado |
|---|---|
| `pnpm typecheck` | PASS |
| `pnpm build` | PASS; Next export estático correcto |
| `pnpm --filter hotel-reservas-backend test:integrity` | PASS: reservation integrity checks |
| `git diff --check` | PASS |
| Validación oficial `quick_validate.py` | No ejecutable: el Python bundled no tiene el módulo `yaml`; se hizo validación equivalente de frontmatter y se confirmó que los ocho SKILL.md tienen secciones requeridas. |

## Criterio de salida de la FASE 1

Cumplido para auditoría estática y verificación de build/integridad. Queda pendiente instrumentar navegador/Lighthouse y pruebas E2E, que pertenecen a fases posteriores y no deben bloquear la creación del sistema de skills.

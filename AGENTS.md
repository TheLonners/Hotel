# AGENTS.md

## Propósito

Este repositorio contiene una aplicación local de gestión hotelera. Trabajar de forma incremental y verificable. La funcionalidad existente, especialmente reservas, calendario, dashboard, importación CSV y datos SQLite, tiene prioridad sobre cualquier mejora estética.

## Stack principal

- Monorepo administrado con pnpm (`pnpm-workspace.yaml`).
- Frontend: Next.js 15, React 19, TypeScript, Tailwind CSS y componentes Radix/Lucide en `frontend/`.
- Backend: Node.js CommonJS, Express, Multer, `xlsx`, dotenv y SQLite mediante `better-sqlite3` en `backend/`.
- Base de datos operativa: `data/hotel.sqlite`. Los respaldos se guardan en `backups/`.
- Servicios de dominio: `backend/src/services/`.
- UI y lógica cliente: `frontend/src/`, con la aplicación administrativa principal en `frontend/src/App.tsx`.
- Auditorías y mapas existentes: `docs/audit/`.

## Estructura general

```text
.
├── .agents/skills/         # Skills operativas del repositorio
├── backend/src/
│   ├── database/           # Conexión y seed SQLite
│   ├── services/           # Reservas, huéspedes, operaciones, CSV, auth
│   └── scripts/            # Backup y verificaciones
├── frontend/src/
│   ├── app/                # Shell Next.js y rutas App Router
│   ├── components/         # UI reutilizable y sistema visual
│   ├── lib/                # Utilidades
│   └── services/           # API y tipos del frontend
├── data/                   # SQLite operativo; tratar como datos sensibles
├── docs/audit/             # Evidencia, mapas y reportes
└── uploads/                # Archivos subidos; no versionar secretos ni datos reales
```

## Reglas para modificar código

1. Inspeccionar primero el archivo, sus imports, sus consumidores y el flujo UI/API que afecta.
2. Hacer el cambio mínimo que resuelva el problema y conservar contratos públicos, rutas y nombres de campos.
3. Mantener separadas las reservas de Airbnb y las reservas directas/WhatsApp. No reutilizar una condición de disponibilidad sin entender su origen.
4. No editar `.env`, credenciales, `data/hotel.sqlite`, `frontend/out`, `frontend/.next`, `node_modules` ni backups reales como parte de una limpieza común.
5. No copiar datos sensibles a reportes, logs, commits o mensajes.
6. Usar `apply_patch` para cambios de texto y revisar el diff inmediatamente.

## Reglas para refactorizar

- Trabajar por fases y por pequeños lotes; no reescribir toda la app.
- Antes de borrar o mover algo, buscar referencias estáticas, imports dinámicos, rutas, handlers y usos desde datos/configuración.
- Preservar estados, mensajes de error, códigos HTTP, formatos CSV y semántica de fechas.
- No cambiar arquitectura, modelos o esquema de SQLite sin plan de migración aprobado.
- Después de cada lote correr las validaciones disponibles y registrar el resultado.

## Reglas de SQLite

- Tratar `data/hotel.sqlite` como fuente de verdad cuando el usuario indique que los registros ya existen.
- Antes de una escritura, ejecutar un backup con `pnpm backup` y verificar el destino.
- Preferir transacciones, consultas parametrizadas y cambios de columnas estrechos.
- Nunca borrar filas, resetear la base o ejecutar migraciones improvisadas.
- Tras una escritura, ejecutar `pnpm --filter hotel-reservas-backend test:integrity` y revisar una muestra de filas afectadas.
- No ejecutar `seed` sobre la base operativa sin confirmar que el flujo es idempotente y seguro.

## Cómo correr el proyecto

Desde la raíz:

```powershell
pnpm install:all
pnpm dev:backend
pnpm dev:frontend
```

El frontend está configurado para escuchar en `0.0.0.0:5173`. El backend usa el puerto configurado por su servidor y debe consultarse en `backend/src/server.js` o en la documentación antes de probar integraciones.

## Validaciones disponibles

Usar solo scripts declarados en los `package.json` actuales:

```powershell
pnpm typecheck
pnpm build
pnpm --filter hotel-reservas-backend test:integrity
pnpm backup
```

También existen `pnpm seed`, `pnpm start`, `pnpm dev:backend` y `pnpm dev:frontend`. Actualmente no hay scripts raíz `lint` ni `test`; no inventarlos. Si se agrega una herramienta, actualizar primero el `package.json` y documentar la decisión.

## Cómo validar cambios

1. Revisar `git diff` y `git status --short`.
2. Ejecutar typecheck y build si el cambio toca frontend.
3. Ejecutar integridad SQLite si toca backend, reservas, CSV o disponibilidad.
4. Probar el flujo visible afectado en desktop y viewport móvil cuando sea UI.
5. Comprobar que no quedan secretos, bases, uploads o artefactos generados en el diff.
6. Registrar comandos, resultados, evidencia y limitaciones en el reporte de fase.

## Trabajo por fases

1. Auditoría sin modificar código de aplicación.
2. Plan priorizado con riesgos y dependencias.
3. Candidatos de dead code y limpieza segura.
4. Refactor pequeño y compatible.
5. Rendimiento.
6. Responsive y accesibilidad.
7. Seguridad.
8. Pruebas E2E y regresión.

No avanzar a la siguiente fase si la anterior no tiene evidencia suficiente o deja validaciones críticas fallando. Una falla debe corregirse o dejarse explícitamente bloqueada con causa y siguiente acción.

## Documentación de decisiones

Para cada cambio importante registrar fecha, fase, problema, archivos, decisión, alternativas descartadas, riesgo para reservas/calendario/CSV/SQLite, validaciones y pendientes. Preferir `docs/audit/` y no colocar datos personales o secretos.

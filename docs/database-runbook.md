# Manual operativo de SQLite

## Ubicación y prerrequisitos

La base predeterminada está en `data/hotel.sqlite`. Configúrala con `DATABASE_PATH` solo en disco local persistente. No use carpetas sincronizadas o de red. Inicie la aplicación con `pnpm dev:backend` y `pnpm dev:frontend`.

Variables documentadas: `backend/.env.example`. En producción local, conserve `DATABASE_ENABLE_WAL=true`, `DATABASE_BUSY_TIMEOUT=5000` y un mínimo de 1 GB libre. Active autenticación antes de exponer la API.

## Operación rutinaria

```powershell
pnpm db:check
pnpm db:backup
pnpm db:test-restore
pnpm db:maintenance
```

`db:check` no modifica la base y devuelve error si falla integridad, FK, reglas de reservas, antigüedad de backup o espacio libre. `db:maintenance` genera primero un respaldo y ejecuta `PRAGMA optimize`; use `pnpm db:maintenance -- --analyze` solo tras revisar impacto. Nunca ejecute `VACUUM` durante horas de uso.

## Migraciones

Antes de actualizar código, ejecute `pnpm db:backup`, confirme la prueba de restauración y después:

```powershell
pnpm db:migrate
pnpm db:check
```

La versión aplicada se guarda en `PRAGMA user_version` y `schema_migrations`. Si una migración informa datos incompatibles, no corrija filas manualmente: restaure el punto previo, genere un reporte y prepare una migración específica.

## Restauración manual

1. Detenga backend y frontend; confirme que ningún proceso conserva la base abierta.
2. Valide el respaldo: `pnpm db:test-restore -- --backup backups/<nombre>`.
3. Ejecute explícitamente:

```powershell
pnpm db:restore -- --backup backups/<nombre> --confirm --app-stopped
```

El comando crea primero un snapshot `hotel_pre_restore_*`, valida la copia solicitada, archiva la base anterior junto con sus archivos WAL/SHM y solo entonces instala el reemplazo. Nunca usa un respaldo sin confirmación. Después, ejecute `pnpm db:check`, `pnpm db:migrate` y arranque el backend.

## Ante `database is locked` / `SQLITE_BUSY`

1. No borre `-wal` ni `-shm`.
2. Revise que no haya dos backends, scripts de importación o antivirus/sincronización bloqueando el archivo.
3. Compruebe que la base no esté en una carpeta de red/sincronizada.
4. Ejecute `pnpm db:check` y guarde su salida sin datos personales.
5. Si persiste, detenga ordenadamente el backend, haga `pnpm db:backup`, revise la configuración de `DATABASE_BUSY_TIMEOUT` y la duración de transacciones.

## Ante corrupción o poco espacio

No sobrescriba la base. Detenga la aplicación, copie el conjunto `hotel.sqlite`, `hotel.sqlite-wal` y `hotel.sqlite-shm` para análisis, y restaure únicamente mediante el procedimiento anterior. Si `db:check` alerta disco bajo, libere espacio o aumente el volumen antes de continuar escribiendo; no elimine respaldos protegidos ni datos operativos de forma manual.

## Mover o actualizar la instalación

Detenga la aplicación, cree y pruebe un backup, copie el directorio de respaldo validado a almacenamiento externo y luego restaure en la nueva instalación. Mantenga la misma versión de Node o una compatible (>=24), ejecute migraciones una vez y valide. No transporte un `.sqlite` aislado mientras WAL esté activo.

# Política de respaldos de base de datos

## Política inicial

- Diario: 14 días.
- Semanal: 8 semanas.
- Mensual: 12 meses.
- Manuales, preimportación y prerestauración: conservar hasta revisión explícita; no son purgados automáticamente.
- Una copia cifrada fuera del servidor/equipo principal.
- Prueba de restauración mensual y después de cualquier actualización de esquema.

`runDueBackups` crea copias diaria, semanal y mensual mediante `node:sqlite.backup`; cada snapshot se valida con `integrity_check`, SHA-256 y manifiesto. La purga solo se habilita con `BACKUP_PRUNE_ENABLED=true`; por defecto no borra nada. Las rutas se validan para que la purga no salga de la carpeta de backups y nunca elimina un registro marcado `protected`.

## Programación y alertas

El backend comprueba respaldos al inicio y cada hora. Programe además `pnpm db:check` diariamente con el monitor local: falla cuando el último backup supera `DATABASE_BACKUP_MAX_AGE_HOURS` (26 por defecto), cuando hay corrupción, FK inválidas o menos de `DATABASE_MIN_FREE_MB` libres.

Conserve los logs de salida del programador de tareas. Toda alerta de backup fallido, `SQLITE_BUSY`, falta de espacio o integridad debe generar revisión humana antes de reintentar operaciones masivas.

## Protección

Los backups contienen información personal y posiblemente adjuntos. Deben residir fuera del directorio servido por el frontend, con permisos limitados al operador de la aplicación y cifrado en reposo para la copia externa. El mismo disco no cuenta como recuperación ante desastre.

## Verificación mensual

```powershell
pnpm db:backup
pnpm db:test-restore
pnpm db:check
```

Registre fecha, operador, resultado y ubicación de la copia externa sin incluir nombres de huéspedes ni documentos.

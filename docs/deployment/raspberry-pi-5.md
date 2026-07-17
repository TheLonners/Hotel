# Prueba operativa en Raspberry Pi 5

Fecha: 2026-07-17
Fase: despliegue de prueba, sin migrar ni modificar la base operativa existente.

## Resultado esperado

La Pi mantiene una sola aplicación Docker: Express publica el frontend estático y la API bajo el mismo origen. SQLite, comprobantes y backups viven en `runtime/` fuera de la imagen. Cloudflare Tunnel abre una conexión saliente HTTPS, por lo que no se abre ningún puerto del router.

```text
Navegador ─HTTPS─> Cloudflare Access ─> Tunnel saliente ─> app Docker :3000
LAN opcional ──────────────────────────────────────────────> app Docker :3000
GitHub privado ─SSH (clave solo lectura)─> checkout de la Pi ─> build verificado
                                                └─ runtime/{data,uploads,backups}
```

No se usa un runner de GitHub Actions dentro de la Pi: para esta prueba añade superficie de ataque y carga innecesaria. Se sube al repositorio privado desde el equipo de desarrollo; la Pi tiene una clave de despliegue de lectura y ejecuta una actualización explícita, con backup previo.

## 1. Hardware y sistema

- Raspberry Pi 5 con fuente oficial de 27 W, disipador/ventilador y SSD USB 3 (evitar microSD para SQLite y logs).
- Raspberry Pi OS Lite de 64 bits, usuario no administrador para uso diario, SSH solo con claves y actualizaciones del sistema aplicadas. La Pi 5 usa kernel de 64 bits; compruébalo con `uname -m`, que debe devolver `aarch64`.
- Para prueba real: 8 GB RAM y SSD de 128 GB o más. En 4 GB funcionará, pero el primer build de Next puede ser más lento y requerir swap moderado.
- Reserva batería/UPS si las reservas se editarán durante cortes eléctricos. SQLite con WAL reduce riesgo de bloqueo, pero no sustituye una alimentación estable ni backups.

En la Pi, instala herramientas base:

```bash
sudo apt update && sudo apt full-upgrade -y
sudo apt install -y git ca-certificates curl ufw
sudo systemctl enable --now ssh
```

No continúes hasta que `uname -m` sea `aarch64` y el SSD esté montado de forma persistente. La aplicación y `runtime/` deben vivir en el SSD, por ejemplo bajo `/opt/hotel-reservas`.

## 2. Docker Engine y Compose

Sigue el repositorio oficial de Docker para tu versión de Raspberry Pi OS/Debian; no uses el instalador no verificado de terceros. Después, concede acceso Docker al usuario de despliegue y vuelve a iniciar sesión:

```bash
sudo usermod -aG docker "$USER"
newgrp docker
docker run --rm hello-world
docker compose version
```

Verifica que Docker inicie después de reiniciar:

```bash
sudo systemctl enable docker
sudo reboot
```

## 3. Acceso al repositorio privado

Crea en la Pi una clave exclusiva y sin passphrase para este único repositorio. No reutilices una clave personal ni actives permisos de escritura:

```bash
install -d -m 700 ~/.ssh
ssh-keygen -t ed25519 -f ~/.ssh/hotel_reservas_deploy -C "hotel-pi-deploy" -N ""
cat ~/.ssh/hotel_reservas_deploy.pub
```

En GitHub: **repositorio → Settings → Deploy keys → Add deploy key**, pega la clave pública y deja desmarcado *Allow write access*. Crea `~/.ssh/config` con permisos `600`:

```text
Host github.com-hotel
  HostName github.com
  User git
  IdentityFile ~/.ssh/hotel_reservas_deploy
  IdentitiesOnly yes
```

Comprueba la autenticación y clona sustituyendo `ORGANIZACION/REPOSITORIO`:

```bash
ssh -T git@github.com-hotel
sudo install -d -o "$USER" -g "$USER" /opt/hotel-reservas
git clone git@github.com-hotel:ORGANIZACION/REPOSITORIO.git /opt/hotel-reservas/app
cd /opt/hotel-reservas/app
```

## 4. Datos, secretos y primer arranque

Nunca copies `data/hotel.sqlite`, `uploads/`, backups o `.env` al repositorio. Si se desea trasladar datos reales, primero ejecuta un backup en el origen y cópialo por un canal seguro al SSD; no sobrescribas una base existente sin una restauración aprobada.

Para una prueba limpia, crea las carpetas y el archivo de secretos solo en la Pi:

```bash
cd /opt/hotel-reservas/app
mkdir -p runtime/data runtime/uploads runtime/backups
cp .env.example .env
chmod 600 .env
nano .env
```

Antes de arrancar cambia, como mínimo, `ADMIN_PASSWORD` y `SESSION_SECRET` por valores distintos de 20+ caracteres. Conserva `AUTH_ENABLED=true`. En el primer inicio se crea el usuario `admin` con esa contraseña; no cambies luego `ADMIN_PASSWORD` de forma improvisada, porque no modifica la contraseña ya almacenada en SQLite.

Inicia y verifica:

```bash
docker compose build --pull app
docker compose up -d app
docker compose ps
curl -f http://127.0.0.1:3000/api/health
docker compose exec -T app node src/scripts/verify-reservation-integrity.js
```

Desde un equipo en la misma red abre `http://IP_DE_LA_PI:3000`. No abras ni reenvíes el puerto 3000 en el router. Si usas UFW, permite solo la subred local, por ejemplo `sudo ufw allow from 192.168.1.0/24 to any port 3000 proto tcp`, habilítalo con `sudo ufw enable` y conserva SSH permitido antes de activarlo.

## 5. Dominio gratuito y Cloudflare Tunnel

Hay dos alternativas, con una distinción importante:

1. **Cero costo y temporal:** `cloudflared tunnel --url http://localhost:3000` genera un `*.trycloudflare.com` aleatorio. Cambia al reiniciar, tiene límite de 200 solicitudes concurrentes y Cloudflare lo reserva para desarrollo; sirve para una demo corta, no para validar operación continuada.
2. **URL estable para la prueba:** registra un dominio económico que controles (Cloudflare Registrar lo vende a precio de registro, no gratis), añádelo a Cloudflare y usa el plan Free más un *named tunnel*. Los subdominios que necesites (`hotel-prueba.tudominio`) no tienen coste adicional. Un dominio estable totalmente gratuito no es un supuesto fiable: los proveedores de dominios gratis pueden retirar, tardar en aprobar o cambiar las condiciones. No lo usaría para datos de huéspedes.

Para la prueba operativa se recomienda la segunda opción. En Cloudflare Zero Trust crea un **Tunnel** de tipo Cloudflared, nómbralo `hotel-pi-prueba`, y añade un *Public hostname* como `hotel-prueba.TU_DOMINIO` hacia `http://app:3000`. Copia el token al campo `CLOUDFLARE_TUNNEL_TOKEN` de `.env`, ajusta `CORS_ORIGIN` al mismo hostname y arranca:

```bash
docker compose --profile tunnel up -d
docker compose logs -f cloudflared
```

Para una demo de cero costo antes de comprar el dominio, usa el perfil temporal y abre la URL que aparezca en los logs. No requiere token ni cuenta Cloudflare:

```bash
docker compose --profile quick-tunnel up -d cloudflared-quick
docker compose logs -f cloudflared-quick
```

El túnel no necesita un puerto público ni IP fija. Añade además una aplicación de **Cloudflare Access** para ese hostname y una política *Allow* limitada a tus correos autorizados. Así primero se exige identidad Cloudflare y después la autenticación propia de la aplicación; es una capa necesaria para esta prueba con información hotelera. No pongas el token del túnel en GitHub, capturas ni tickets.

## 6. Actualización desde GitHub

En el PC de desarrollo se hacen commits y push al repositorio privado. En la Pi, el script incluido solo acepta avances rápidos de `main`, crea un backup con la versión anterior, reconstruye la imagen y ejecuta la comprobación de integridad:

```bash
cd /opt/hotel-reservas/app
chmod 700 deploy/pi-update.sh
./deploy/pi-update.sh main
```

No programes actualizaciones automáticas mientras se esté validando reservas: una actualización debe hacerse fuera de horario, con backup verificado y una persona disponible para revisar `docker compose logs --tail=200 app`. Para volver a la versión anterior, identifica el commit previo, revisa el diff y restáuralo solo después de confirmar un backup; nunca borres `runtime/data` como forma de revertir.

## 7. Prueba funcional, rendimiento y recuperación

Ejecuta esta matriz y anota fecha, versión de commit y resultado en `docs/audit/` sin datos personales:

| Prueba | Éxito esperado |
| --- | --- |
| Arranque/reinicio | `docker compose ps` muestra `healthy`; interfaz y `/api/health` recuperan tras `docker compose restart app`. |
| Reservas | Crear, editar y consultar una reserva; intentar un cruce y confirmar que se rechaza. |
| Datos | Subir y descargar un comprobante de prueba; crear backup y validarlo desde la interfaz o API. |
| Concurrencia | Ejecutar `docker compose exec -T app node src/scripts/test-reservation-concurrency.js` y revisar que no haya cruces. |
| Rendimiento LAN/remoto | Medir carga inicial, navegación de calendario de 12 meses y creación de reserva desde escritorio y móvil. Anotar latencia, CPU, RAM, temperatura y disco. |
| Red | Desconectar Internet: la LAN debe seguir funcionando. Reconectar: `cloudflared` debe recuperar el túnel sin cambiar datos. |
| Recuperación | Restaurar una copia de prueba en ruta separada con `docker compose exec -T app node src/scripts/db-test-restore.js`; no practiques sobre la base operativa. |

Durante una prueba de carga moderada observa la Pi:

```bash
docker stats --no-stream
vcgencmd measure_temp
df -h /opt/hotel-reservas
docker compose logs --tail=200 app
```

Detén la prueba si el SSD está casi lleno, la Pi se estrangula por temperatura o falla una validación de integridad. Lo siguiente sería automatizar backups fuera de la Pi (otro disco/NAS/cuenta cloud cifrada), que no es gratuito de manera fiable y debe aprobarse antes de configurarlo.

## Evidencia y límites

Se validó localmente que `pnpm build` completa y produce el frontend estático que el backend publica. Falta ejecutar esta guía en la Pi real: la imagen Docker, el túnel, Access, la medición térmica y la matriz funcional requieren el dispositivo, dominio y cuentas del propietario.

Referencias: [Raspberry Pi OS 64-bit](https://www.raspberrypi.com/documentation/usage/raspberry-pi-os/raspberry-pi.html), [Docker Engine para ARM64](https://docs.docker.com/engine/install/), [Cloudflare Tunnel](https://developers.cloudflare.com/tunnel/setup/), [publicar aplicaciones con Tunnel](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/routing-to-tunnel/), [Cloudflare Registrar](https://developers.cloudflare.com/registrar/), [deploy keys de GitHub](https://docs.github.com/en/rest/deploy-keys/deploy-keys), [uso y cobro de GitHub Actions](https://docs.github.com/en/actions/concepts/billing-and-usage).

# Despliegue gratis: Vercel (frontend) + Render (API y worker) + Neon (base)

Sin dominio propio. El frontend en Vercel reenvía `/backend/*` a la API en Render (ver `frontend/vercel.json`), así el navegador ve un solo origen y las cookies de sesión funcionan. Probado en local con un proxy equivalente: inicio de sesión, `/me`, alertas y tiempo real (SSE) pasan bien. **No se probó en Vercel ni en Render reales.**

## 0. Antes de subir
1. Rota los secretos que ya circularon (Gmail: https://myaccount.google.com/apppasswords · token del bot en @BotFather `/revoke`). Usa los nuevos.
2. La contraseña del rol `turnoextra_app` en Neon sigue siendo la de la plantilla (`CAMBIAR_app_pw`). Cámbiala por una larga:
   `ALTER ROLE turnoextra_app WITH PASSWORD '<nueva>';` (conectado como `neondb_owner`) y úsala en `DATABASE_URL`.
3. Sube el código a GitHub (un repositorio con `backend/` y `frontend/`). El `.env` NO se sube: está en `.gitignore`.

## 1. Render (API + worker en un servicio)
1. render.com → New → **Blueprint** → elige el repositorio. Lee `render.yaml` (en la raíz del repositorio) y crea `turnoextra-api` (plan Free).
2. Te pide las variables marcadas `sync: false`:
   | Variable | Valor |
   |---|---|
   | `DATABASE_URL` | cadena de Neon del rol `turnoextra_app` |
   | `BETTER_AUTH_URL` | `https://turnoextra-api.onrender.com` (la URL que Render le asigne) |
   | `APP_URL` | `https://TU-APP.vercel.app` (sin barra final) |
   | `CORS_ORIGINS` | igual que `APP_URL` |
   | `SMTP_URL` | `smtps://TU_CORREO%40gmail.com:CONTRASEÑA_DE_APLICACIÓN@smtp.gmail.com:465` |
   | `EMAIL_FROM` | `TurnoExtra <TU_CORREO@gmail.com>` |
   | `TELEGRAM_BOT_TOKEN` / `TELEGRAM_BOT_USERNAME` | del bot (usuario sin @) |
3. Cuando termine, abre `https://turnoextra-api.onrender.com/health`: debe responder `ok`.
4. Render gratis **se duerme tras 15 min sin tráfico**, y con él el worker (no hay turnos, envíos ni Telegram). Crea un monitor gratis en uptimerobot.com que consulte `/health` cada 5 minutos.

## 2. Vercel (frontend)
1. En `frontend/vercel.json` cambia `REEMPLAZA-CON-TU-API.onrender.com` por el host de Render.
2. vercel.com → Add New Project → mismo repositorio → **Root Directory: `frontend`**. Vercel detecta Vite; `frontend/.env.production` ya fija `VITE_API_URL=/backend`.
3. Deploy. Copia la URL final (`https://TU-APP.vercel.app`) y vuelve a Render a poner `APP_URL` y `CORS_ORIGINS` si usaste una provisional (Render redespliega solo).

## 3. Datos y cuentas
- La base ya está migrada y sembrada (Neon). Cuentas de la feria: ver `backend/OPERACION.md` y los comandos `feria-seed` / `feria-live`.
- Super admin: `SUPERADMIN_PASSWORD=... npm run cli -w @turnoextra/api -- superadmin <correo> <nombre>`.

## 4. Verificación rápida (5 min)
1. Entra a la URL de Vercel → `/login` con un gerente de la feria → ves el panel.
2. Super admin: crea una organización invitando a tu Gmail → llega el correo de invitación → aceptar lleva a Vercel.
3. Escribe `/start` al bot: responde (el worker lee Telegram por sondeo).
4. Publica un turno: la oferta llega por Telegram a quien tenga el canal vinculado.

## Limitaciones conocidas
- **WhatsApp apagado** (`WHATSAPP_ENABLED=false`) hasta habilitar el canal en Meta.
- **Tiempo real a través del proxy de Vercel**: funciona en la prueba local; en Vercel puede cortarse tras unos minutos. El navegador reconecta solo y cada pantalla se refresca por consulta periódica como respaldo.
- **Correo desde Gmail**: puede caer en spam y tiene tope de unos 500 envíos al día.
- **Nunca se probó el build de Docker** (no hay Docker en esta máquina); el primer despliegue en Render es esa prueba. Si falla, el log del build lo dirá.
- **Términos legales** sin publicar y **parámetros legales por validar** con un contador (ver `OPERACION.md`).
- Sin «olvidé mi contraseña».

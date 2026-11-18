# Operación y ensayo de TurnoExtra

Guía para desplegar, ensayar con 5 personas reales y presentar. Nada de esto se probó contra Meta, Telegram ni un SMTP real: el primer ensayo con credenciales reales es la primera prueba de esos canales.

## 1. Despliegue (decide Lucas dónde)

Se necesita un servidor con **conexiones largas** (el tiempo real usa SSE; no sirven funciones serverless) y Postgres 16 administrado con backups.

Procesos (la misma imagen, ver `Dockerfile`; el build no se probó aquí):

| Proceso | Comando | Notas |
| --- | --- | --- |
| Migraciones | `node packages/db/dist/migrate-cli.js` | Con `MIGRATION_DATABASE_URL` (rol dueño). Corre antes de cada despliegue. |
| API | `node apps/api/dist/src/main.js` | Puerto `PORT`. Detrás de TLS. |
| Worker | `node apps/worker/dist/main.js` | **Uno solo** basta; si hay dos no se duplican envíos (cola con `SKIP LOCKED`). |

Variables: las mismas de `.env.example`, definidas en el panel del proveedor (no en archivo). API y worker usan los mismos valores. Obligatorias en producción: `DATABASE_URL`, `MIGRATION_DATABASE_URL`, `APP_DB_PASSWORD`, `BETTER_AUTH_SECRET` (32+ caracteres), `BETTER_AUTH_URL`, `APP_URL`, `CORS_ORIGINS`, `POLICY_URL`. Para canales reales: `WHATSAPP_*`, `TELEGRAM_*`, `SMTP_URL`. `DEMO_MODE=false` salvo plan B.

Webhooks (URL pública con HTTPS):
- WhatsApp: `https://<api>/webhooks/whatsapp` con `WHATSAPP_VERIFY_TOKEN`; Meta firma con `WHATSAPP_APP_SECRET`.
- Telegram: `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://<api>/webhooks/telegram&secret_token=<TELEGRAM_WEBHOOK_SECRET>`.

Primer arranque: `superadmin` y `demo-seed` por CLI (`npm run cli -w @turnoextra/api -- …`, ver README).

Rotación de secretos: cambiar la variable en el proveedor y reiniciar API y worker. Rotar `BETTER_AUTH_SECRET` cierra todas las sesiones y invalida los enlaces de correo ya enviados.

Backups: activar los automáticos del proveedor y **hacer una restauración de prueba** en una base aparte antes de la feria (pendiente; no se puede hacer desde aquí).

## 2. Ritual de la ventana de 24 h (WhatsApp)

Mientras Meta no apruebe plantillas, el sistema solo puede escribirle a quien le escribió al número en las últimas 24 h.

1. **Justo antes de la presentación** (idealmente 30 min), cada voluntario escribe «Hola» (o «ALTA») al número de prueba.
2. Si pasan más de 24 h desde ese mensaje, repetirlo.
3. El gerente que reciba alertas urgentes por WhatsApp también debe escribirle al número.
4. Quien no esté en la ventana no recibe la oferta por WhatsApp: el sistema escala a Telegram o correo si los tiene vinculados.

## 3. Ensayo general con 5 voluntarios

Antes: org con gerente invitado y términos aceptados, rol mesero habilitado, parámetros legales cargados (piso validado por un contador), política de datos publicada en `POLICY_URL` (hay personas reales).

1. Cada voluntario hace ALTA con el código de la org y toca «Acepto» (consentimiento real).
2. El gerente registra los 5 en la banca y aprueba su documento.
3. Dos voluntarios vinculan Telegram (`TELEGRAM`) y uno el correo (`CORREO x@y.z`).
4. El gerente crea un turno de 2 cupos con panel abierto (SSE): llegan las ofertas (cupos × 2 = 4).
5. Varios aceptan casi a la vez: 2 confirmados, la reserva en espera, el resto «lleno».
6. Un confirmado escribe NO PUEDO IR: sube la reserva y el gerente ve la alerta (urgente si faltan < 3 h).
7. Pasado el fin del turno, el gerente marca asistencia; uno queda `no_show`, recibe el aviso y responde con su explicación; el gerente resuelve la disputa.
8. Descargar el reporte mensual CSV.
9. Un voluntario escribe BORRAR MIS DATOS y se confirma que el reporte sigue, anonimizado.

Registrar con datos reales lo que salga (tiempo hasta la primera aceptación, tiempo de cobertura, mensajes enviados, reservas promovidas): son las únicas cifras que se pueden mostrar. No se inventan.

## 4. Prueba de carga (rotulada como lo que es)

    npm run cli -w @turnoextra/api -- load-test 50 5

Crea una organización desechable con candidatos sintéticos (sin nombre ni celular) y lanza 50 aceptaciones simultáneas de un turno de 5 cupos, cada una en su transacción, contra la base real. Imprime el tiempo, los resultados y si se cumplió el invariante (5 confirmados exactos). Mostrarla como «script de carga», no como 50 personas. Hacerlo contra la base de ensayo, no contra la de la feria: deja la organización `Carga …` con sus datos sintéticos.

## 5. Derechos de los titulares

    npm run cli -w @turnoextra/api -- data export <celular>   # JSON con todo lo guardado de la persona
    npm run cli -w @turnoextra/api -- data delete <celular>   # igual a BORRAR MIS DATOS

Consultas se responden en 10 días hábiles y reclamos en 15 (Ley 1581); el responsable y su correo de contacto deben estar en la política publicada.

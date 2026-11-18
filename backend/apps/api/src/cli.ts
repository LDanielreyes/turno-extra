import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { loadEnv } from '@turnoextra/shared';
import { audit, createDb, orgRoles, orgs, organization, roles, user, withSuper, workers } from '@turnoextra/db';
import { deleteWorkerData, exportWorkerData } from '@turnoextra/channels';
import { normalizeCoPhone } from '@turnoextra/shared';
import { runLoad } from './load.js';
import { feriaLinkTelegram, feriaLive, feriaSeed } from './feria.js';
import { createAuth } from './auth/auth.js';
import { LogEmailProvider } from './email.js';

const usage = `Uso:
  SUPERADMIN_PASSWORD=... npm run cli -w @turnoextra/api -- superadmin <correo> <nombre>
  npm run cli -w @turnoextra/api -- demo-seed
  FERIA_PASSWORD=... npm run cli -w @turnoextra/api -- feria-seed   (datos de demostración; una sola vez)
  npm run cli -w @turnoextra/api -- feria-live                      (turno en vivo nuevo para la presentación)
  npm run cli -w @turnoextra/api -- feria-link-telegram <celular> <chat_id> [nombre] [org=hotel-demo] [rol=mesero]   (te registra a ti, con tu Telegram ya vinculado)
  npm run cli -w @turnoextra/api -- load-test [aceptaciones=50] [cupos=5]
  npm run cli -w @turnoextra/api -- data export <celular>   (JSON a la salida estándar)
  npm run cli -w @turnoextra/api -- data delete <celular>`;

const env = loadEnv();
const { db, close } = createDb(env.DATABASE_URL);
const [cmd, ...args] = process.argv.slice(2);

try {
  if (cmd === 'superadmin') {
    const [mail, name] = args;
    const password = process.env.SUPERADMIN_PASSWORD; // por entorno, nunca por argumento
    if (!mail || !name || !password) throw new Error(usage);
    // Única vía de registro abierto: esta CLI.
    const auth = createAuth({ db, env, email: new LogEmailProvider(() => {}), allowOpenSignup: true });
    await auth.api.signUpEmail({ body: { email: mail.toLowerCase(), name, password } });
    await db.update(user).set({ role: 'super_admin', emailVerified: true }).where(eq(user.email, mail.toLowerCase()));
    console.log('Super admin creado. Activa la verificación en dos pasos al iniciar sesión (obligatoria).');
  } else if (cmd === 'demo-seed') {
    // Org de demostración con todos los roles activos. Idempotente por slug.
    const slug = 'hotel-demo';
    const [exists] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, slug));
    if (exists) {
      console.log('La organización demo ya existe.');
    } else {
      const id = randomUUID();
      await db.insert(organization).values({ id, name: 'Hotel Demo', slug });
      await withSuper(db, async (tx) => {
        await tx.insert(orgs).values({ id, nombre: 'Hotel Demo', waveMinutes: 1 }); // demo: parámetro real de la org
        const active = await tx.select({ id: roles.id }).from(roles).where(eq(roles.activo, true));
        if (active.length) await tx.insert(orgRoles).values(active.map((r) => ({ orgId: id, roleId: r.id })));
        await audit(tx, { orgId: id, actorId: null, accion: 'demo.seeded', entidad: 'org', entidadId: id });
      });
      console.log('Organización demo creada (wave_minutes = 1). Invita a su gerente desde el panel super admin.');
    }
  } else if (cmd === 'feria-seed') {
    const password = process.env.FERIA_PASSWORD; // por entorno, nunca por argumento
    if (!password || password.length < 10) throw new Error(`FERIA_PASSWORD (mín. 10 caracteres) es obligatoria.\n${usage}`);
    const auth = createAuth({ db, env, email: new LogEmailProvider(() => {}), allowOpenSignup: true });
    const signUp = async (mail: string, name: string) => {
      const [u] = await db.select({ id: user.id }).from(user).where(eq(user.email, mail));
      if (!u) await auth.api.signUpEmail({ body: { email: mail, name, password } });
      const [row] = await db.update(user).set({ emailVerified: true }).where(eq(user.email, mail)).returning({ id: user.id });
      return row!.id;
    };
    const r = await feriaSeed(db, signUp);
    if (r.already) console.log('Los datos de la feria ya estaban sembrados. Para un turno en vivo nuevo: feria-live.');
    else {
      console.log('Datos de la feria sembrados: Hotel Demo, Bistró Demo y Eventos Demo (invitación pendiente).');
      console.log('Gerentes (contraseña = FERIA_PASSWORD): gerencia.hotel@example.com, turnos.hotel@example.com, gerencia.bistro@example.com');
      console.log(`Turno en vivo: /turnos/${r.live.shiftId}`);
    }
  } else if (cmd === 'feria-live') {
    const r = await feriaLive(db);
    console.log(`Turno en vivo creado: /turnos/${r.shiftId} (inicia ${r.inicio.toISOString()}).`);
  } else if (cmd === 'feria-link-telegram') {
    const [celular, chatId, nombre = 'Yo (demo)', orgSlug = 'hotel-demo', roleSlug = 'mesero'] = args;
    const phone = celular ? normalizeCoPhone(celular) : null;
    if (!phone || !chatId || !/^\d+$/.test(chatId)) throw new Error(usage);
    await feriaLinkTelegram(db, { orgSlug, celular: phone, nombre, chatId, roleSlug });
    console.log(`Listo: ${nombre} quedó activo en ${orgSlug} con Telegram vinculado. Recibirá las ofertas por el bot.`);
  } else if (cmd === 'load-test') {
    const n = Number(args[0] ?? 50);
    const cupos = Number(args[1] ?? 5);
    if (!Number.isInteger(n) || !Number.isInteger(cupos) || n < 1 || n > 500 || cupos < 1 || cupos > 50) throw new Error(usage);
    console.log(`PRUEBA DE CARGA (script) — ${n} aceptaciones simultáneas de un turno de ${cupos} cupos.`);
    console.log('No son personas: son candidatos sintéticos en una organización desechable, contra la base real.');
    const r = await runLoad(db, { n, cupos });
    console.log(`Tiempo total: ${r.ms} ms. Resultados: ${JSON.stringify(r.outcomes)}.`);
    console.log(`Confirmados: ${r.confirmados} de ${cupos} cupos · en espera: ${r.enEspera} · invariantes: ${r.ok ? 'OK' : 'ROTOS'}`);
    if (!r.ok) process.exitCode = 1;
  } else if (cmd === 'data') {
    const [sub, celular] = args;
    const phone = celular ? normalizeCoPhone(celular) : null;
    if ((sub !== 'export' && sub !== 'delete') || !phone) throw new Error(usage);
    await withSuper(db, async (tx) => {
      const [w] = await tx.select({ id: workers.id }).from(workers).where(eq(workers.celular, phone));
      if (!w) {
        console.error('No hay una persona con ese celular.');
        process.exitCode = 1;
        return;
      }
      if (sub === 'export') {
        console.log(JSON.stringify(await exportWorkerData(tx, w.id), null, 2));
      } else {
        const r = await deleteWorkerData(tx, w.id, { actorId: 'cli:data-delete' });
        console.log(`Datos borrados (${r.deleted ? r.orgs : 0} organizaciones afectadas).`);
      }
    });
  } else {
    console.log(usage);
    process.exitCode = 1;
  }
} finally {
  await close();
}

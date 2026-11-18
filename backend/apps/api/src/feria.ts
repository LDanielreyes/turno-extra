// Datos de demostración para la feria y la presentación del producto (`feria-seed` y `feria-live`).
//
// Son datos ficticios pero coherentes con las reglas reales:
// - piso legal calculado con los parámetros vigentes
// - elegibilidad: rol, documentos aprobados y canales habilitados
// - estados válidos y bitácora consistente
// Celulares en el bloque 300 555 xxxx, correos @example.com (dominio reservado) y Telegram con ids inventados,
// para que nada le llegue a una persona real.
// Cada turno abierto ya tiene oferta para todos sus elegibles, así el worker no lanza oleadas nuevas sobre ellos.
import { randomUUID } from 'node:crypto';
import { Decimal } from 'decimal.js';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import {
  alerts, assignments, auditLog, disputes, invitation, member, offerDeliveries, orgRoles, orgWorkers, organization, orgs,
  roles, shiftOffers, shifts, user, withSuper, workerChannels, workerConsents, workerDocuments, type Db, type Tx,
} from '@turnoextra/db';
import { computeFloor } from './services/floor.js';
import { floorParamsAt } from './services/legal-params.js';

export const LIVE_TAG = 'seed:feria-live';
const SEED_TAG = 'seed:feria';
const H = 3600_000;
const DAY = 24 * H;

/** Instante de Bogotá (UTC−5, sin horario de verano): `d` días desde hoy a la hora local `h`. */
function bog(d: number, h: number, m = 0) {
  const nowLocal = new Date(Date.now() - 5 * H);
  const day = Date.UTC(nowLocal.getUTCFullYear(), nowLocal.getUTCMonth(), nowLocal.getUTCDate());
  return new Date(day + d * DAY + (h + 5) * H + m * 60_000);
}
const dateOnly = (ms: number) => new Date(ms - 5 * H).toISOString().slice(0, 10);

/** Pago de ejemplo: piso legal + prima, redondeado hacia arriba a miles de 5. Siempre ≥ piso. */
async function payFor(tx: Tx, inicio: Date, fin: Date, prima: string) {
  const piso = new Decimal(computeFloor(inicio, fin, await floorParamsAt(tx, inicio)).pisoTotal);
  const pago = piso.mul(prima).div(5000).ceil().mul(5000);
  return { piso: piso.toFixed(0), pago: Decimal.max(pago, piso).toFixed(0) };
}

type Person = {
  key: string; nombre: string; rol: string; fav?: boolean; estado?: 'activo' | 'pendiente' | 'baja';
  tg?: boolean; mail?: boolean; doc?: 'aprobado' | 'pendiente' | 'rechazado'; vence?: number;
};

// Banca del hotel. `key` = sufijo del celular 300 555 01xx.
const HOTEL: Person[] = [
  { key: '01', nombre: 'Ana María Rojas', rol: 'mesero', fav: true, tg: true },
  { key: '02', nombre: 'Juan Esteban Díaz', rol: 'mesero', fav: true },
  { key: '03', nombre: 'Valentina Torres', rol: 'mesero', fav: true, mail: true },
  { key: '04', nombre: 'Santiago Herrera', rol: 'mesero', tg: true },
  { key: '05', nombre: 'Daniela Castro', rol: 'mesero' },
  { key: '06', nombre: 'Mateo Vargas', rol: 'mesero', mail: true },
  { key: '07', nombre: 'Felipe Moreno', rol: 'mesero', vence: 18 },
  { key: '08', nombre: 'Laura Sánchez', rol: 'mesero', estado: 'pendiente', doc: 'pendiente' },
  { key: '09', nombre: 'Carolina Mejía', rol: 'cocina', fav: true, tg: true },
  { key: '10', nombre: 'Andrés Ramírez', rol: 'cocina' },
  { key: '11', nombre: 'Paula Jiménez', rol: 'cocina', mail: true },
  { key: '12', nombre: 'Sebastián López', rol: 'cocina', estado: 'baja' },
  { key: '13', nombre: 'Jorge Martínez', rol: 'seguridad', fav: true },
  { key: '14', nombre: 'Diana Patiño', rol: 'seguridad', estado: 'pendiente', doc: 'pendiente' },
  { key: '15', nombre: 'Ricardo Gutiérrez', rol: 'conductor', tg: true },
  { key: '16', nombre: 'Camilo Restrepo', rol: 'conductor', doc: 'rechazado' },
];
// Banca del bistró: dos personas comparten banca con el hotel (la misma persona, otro vínculo).
const BISTRO: Person[] = [
  { key: '01', nombre: 'Ana María Rojas', rol: 'mesero', fav: true },
  { key: '09', nombre: 'Carolina Mejía', rol: 'cocina', fav: true },
  { key: '21', nombre: 'Nicolás Rincón', rol: 'mesero' },
  { key: '22', nombre: 'Isabela Cárdenas', rol: 'mesero', mail: true },
  { key: '23', nombre: 'Tomás Ospina', rol: 'cocina' },
  { key: '24', nombre: 'Mariana Quintero', rol: 'mesero', estado: 'pendiente', doc: 'pendiente' },
];
const phone = (key: string) => `+57300555${key.padStart(4, '01')}`;
const slugify = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '.');

type Ctx = {
  tx: Tx; roleId: Record<string, string>; reqDoc: Record<string, string | undefined>;
  logs: (typeof auditLog.$inferInsert)[];
};
const log = (c: Ctx, at: Date, e: Omit<typeof auditLog.$inferInsert, 'at'>) => c.logs.push({ ...e, at });

/** Personas de una banca: worker global (ensure_worker), vínculo con la org, canales, consentimiento y documentos. */
async function seedBanca(c: Ctx, orgId: string, people: Person[], reviewer: string) {
  const out: Record<string, { workerId: string; ow: string; p: Person }> = {};
  for (const [i, p] of people.entries()) {
    const cel = phone(p.key);
    const since = new Date(Date.now() - (60 - i * 2) * DAY);
    const r = await c.tx.execute(sql`SELECT ensure_worker(${cel}) AS id`);
    const workerId = ((r as unknown as { rows?: { id: string }[] }).rows ?? (r as unknown as { id: string }[]))[0]!.id;
    const estado = p.estado ?? 'activo';
    const [ow] = await c.tx.insert(orgWorkers)
      .values({ orgId, workerId, nombre: p.nombre, roleId: c.roleId[p.rol], favorito: !!p.fav, estado, createdAt: since })
      .returning({ id: orgWorkers.id });
    log(c, since, { orgId, actorId: reviewer, accion: 'worker.created', entidad: 'org_worker', entidadId: ow!.id });

    if (estado !== 'pendiente') {
      // Canales: los activa la persona (ALTA por WhatsApp; Telegram y correo después). Se insertan una sola vez por persona.
      const chans = [{ canal: 'whatsapp', identificador: cel, prioridad: 10 }];
      if (p.tg) chans.push({ canal: 'telegram', identificador: `9100${p.key.padStart(4, '0')}55`, prioridad: 20 });
      if (p.mail) chans.push({ canal: 'email', identificador: `${slugify(p.nombre)}@example.com`, prioridad: 30 });
      await c.tx.insert(workerChannels)
        .values(chans.map((ch) => ({ workerId, ...ch, habilitado: true, verificadoAt: since })))
        .onConflictDoNothing();
      await c.tx.insert(workerConsents).values({
        orgId, workerId, canal: 'whatsapp', acceptedAt: new Date(since.getTime() + H),
        revokedAt: estado === 'baja' ? new Date(Date.now() - 5 * DAY) : null,
      });
      log(c, new Date(since.getTime() + H), { orgId, actorId: 'system:engine', accion: 'worker.consent_accepted', entidad: 'worker', entidadId: workerId });
    }

    const tipo = c.reqDoc[p.rol];
    if (tipo) {
      const docEstado = p.doc ?? 'aprobado';
      const reviewed = docEstado !== 'pendiente';
      const [d] = await c.tx.insert(workerDocuments).values({
        orgId, workerId, tipoDocumento: tipo, estado: docEstado,
        venceAt: dateOnly(Date.now() + (p.vence ?? 160 + i * 9) * DAY),
        revisadoPor: reviewed ? reviewer : null, revisadoAt: reviewed ? new Date(since.getTime() + 2 * H) : null, createdAt: since,
      }).returning({ id: workerDocuments.id });
      log(c, since, { orgId, actorId: reviewer, accion: 'document.created', entidad: 'worker_document', entidadId: d!.id });
    }
    out[p.key] = { workerId, ow: ow!.id, p };
  }
  return out;
}

type ShiftSpec = {
  rol: string; d: number; h: number; horas: number; cupos: number; estado: 'abierto' | 'cubierto' | 'cancelado' | 'vencido' | 'completado';
  notas?: string; prima?: string;
  // asignaciones: [clave persona, estado]
  a?: [string, 'confirmed' | 'standby' | 'cancelled' | 'completed' | 'no_show' | 'disputed'][];
  // ofertas sin asignación: [clave persona, estado]
  o?: [string, 'declined' | 'expired' | 'read' | 'delivered' | 'sent'][];
  createdBy?: string;
};

async function seedShift(c: Ctx, orgId: string, s: ShiftSpec, people: Record<string, { workerId: string }>, actor: string) {
  const inicio = bog(s.d, s.h);
  const fin = new Date(inicio.getTime() + s.horas * H);
  const { piso, pago } = await payFor(c.tx, inicio, fin, s.prima ?? '1.15');
  const created = new Date(Math.min(inicio.getTime() - 2 * DAY, Date.now() - 6 * H));
  const offered = [...(s.a ?? []), ...(s.o ?? [])];
  const [row] = await c.tx.insert(shifts).values({
    orgId, roleId: c.roleId[s.rol]!, inicio, fin, cupos: s.cupos, pagoTotal: pago, pisoCalculado: piso, estado: s.estado,
    waveCount: offered.length ? 1 : 0, lastWaveAt: offered.length ? created : null, notas: s.notas ?? null,
    createdBy: s.createdBy ?? actor, createdAt: created,
  }).returning({ id: shifts.id });
  const shiftId = row!.id;
  log(c, created, { orgId, actorId: actor, accion: 'shift.created', entidad: 'shift', entidadId: shiftId, detalle: { cupos: s.cupos } });
  if (offered.length) log(c, created, { orgId, actorId: 'system:offers', accion: 'shift.wave_sent', entidad: 'shift', entidadId: shiftId, detalle: { wave: 1, ofertas: offered.length } });

  const ids: Record<string, string> = {};
  for (const [k, st] of s.o ?? []) {
    const offerStatus = s.estado === 'abierto' ? st : st === 'declined' ? 'declined' : s.estado === 'cubierto' ? 'cancelled' : 'expired';
    const [o] = await c.tx.insert(shiftOffers).values({
      orgId, shiftId, workerId: people[k]!.workerId, status: offerStatus, wave: 1, canalUsado: 'whatsapp', createdAt: created,
      respondedAt: st === 'declined' ? new Date(created.getTime() + 20 * 60_000) : null, respondedCanal: st === 'declined' ? 'whatsapp' : null,
    }).returning({ id: shiftOffers.id });
    await c.tx.insert(offerDeliveries).values({ orgId, offerId: o!.id, canal: 'whatsapp', estado: 'sent', at: created });
  }
  for (const [k, st] of s.a ?? []) {
    const acceptedAt = new Date(created.getTime() + 9 * 60_000);
    const [o] = await c.tx.insert(shiftOffers).values({
      orgId, shiftId, workerId: people[k]!.workerId, status: 'accepted', wave: 1, canalUsado: 'whatsapp', createdAt: created,
      respondedAt: acceptedAt, respondedCanal: 'whatsapp',
    }).returning({ id: shiftOffers.id });
    await c.tx.insert(offerDeliveries).values([
      { orgId, offerId: o!.id, canal: 'whatsapp', estado: 'sent', at: created },
      { orgId, offerId: o!.id, canal: 'whatsapp', estado: 'read', at: new Date(created.getTime() + 4 * 60_000) },
    ]);
    const [a] = await c.tx.insert(assignments).values({ orgId, shiftId, workerId: people[k]!.workerId, status: st, acceptedAt }).returning({ id: assignments.id });
    ids[k] = a!.id;
    log(c, acceptedAt, { orgId, actorId: 'system:offers', accion: st === 'standby' ? 'assignment.standby' : 'assignment.confirmed', entidad: 'assignment', entidadId: a!.id });
  }
  if (s.estado === 'cancelado') log(c, new Date(created.getTime() + H), { orgId, actorId: actor, accion: 'shift.cancelled', entidad: 'shift', entidadId: shiftId });
  if (s.estado === 'vencido') log(c, inicio, { orgId, actorId: 'system:offers', accion: 'shift.expired', entidad: 'shift', entidadId: shiftId });
  return { shiftId, inicio, assignments: ids };
}

/** Usuario gerente con contraseña (Better Auth) y correo verificado. Idempotente por correo. */
type SignUp = (email: string, name: string) => Promise<string>;

async function ensureOrg(db: Db, id: string | null, nombre: string, slug: string, waveMinutes: number) {
  const [exists] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, slug));
  if (exists) return exists.id;
  const orgId = id ?? randomUUID();
  await db.insert(organization).values({ id: orgId, name: nombre, slug, createdAt: new Date(Date.now() - 75 * DAY) });
  await withSuper(db, async (tx) => {
    await tx.insert(orgs).values({ id: orgId, nombre, waveMinutes, createdAt: new Date(Date.now() - 75 * DAY) });
  });
  return orgId;
}

export async function feriaSeed(db: Db, signUp: SignUp) {
  // La bitácora tiene RLS: la marca de siembra solo se ve en contexto de super admin.
  const [done] = await withSuper(db, (tx) => tx.select({ id: auditLog.id }).from(auditLog).where(eq(auditLog.accion, 'feria.seeded')).limit(1));
  if (done) return { already: true as const };

  const [root] = await db.select({ id: user.id }).from(user).where(eq(user.role, 'super_admin')).limit(1);
  if (!root) throw new Error('Primero crea el super admin (comando superadmin).');

  const hotelId = await ensureOrg(db, null, 'Hotel Demo', 'hotel-demo', 1);
  const bistroId = await ensureOrg(db, null, 'Bistró Demo', 'bistro-demo', 3);
  const eventosId = await ensureOrg(db, null, 'Eventos Demo', 'eventos-demo', 3);

  // Gerentes: el hotel usa sus 3 cupos (2 cuentas + 1 invitación); el bistró tiene 1; eventos solo la invitación.
  const laura = await signUp('gerencia.hotel@example.com', 'Laura Gómez');
  const andres = await signUp('turnos.hotel@example.com', 'Andrés Ruiz');
  const camila = await signUp('gerencia.bistro@example.com', 'Camila Ortiz');
  const memberRows = [
    { organizationId: hotelId, userId: laura, role: 'admin', d: 70 },
    { organizationId: hotelId, userId: andres, role: 'admin', d: 41 },
    { organizationId: bistroId, userId: camila, role: 'admin', d: 52 },
  ];
  for (const m of memberRows) {
    await db.insert(member).values({ id: randomUUID(), organizationId: m.organizationId, userId: m.userId, role: m.role, createdAt: new Date(Date.now() - m.d * DAY) })
      .onConflictDoNothing();
  }
  await db.insert(invitation).values([
    { id: randomUUID(), organizationId: hotelId, email: 'recepcion.hotel@example.com', role: 'admin', status: 'pending', inviterId: laura, expiresAt: new Date(Date.now() + 5 * DAY), createdAt: new Date(Date.now() - 2 * DAY) },
    { id: randomUUID(), organizationId: eventosId, email: 'gerencia.eventos@example.com', role: 'admin', status: 'pending', inviterId: root.id, expiresAt: new Date(Date.now() + 6 * DAY), createdAt: new Date(Date.now() - DAY) },
  ]);

  await withSuper(db, async (tx) => {
    const roleRows = await tx.select({ id: roles.id, slug: roles.slug }).from(roles);
    const roleId = Object.fromEntries(roleRows.map((r) => [r.slug, r.id]));
    for (const slug of ['mesero', 'cocina', 'seguridad', 'conductor']) if (!roleId[slug]) throw new Error(`Falta el rol ${slug} en el catálogo`);
    const reqs = await tx.execute(sql`SELECT r.slug, rr.tipo_documento AS tipo FROM role_requirements rr JOIN roles r ON r.id = rr.role_id WHERE rr.obligatorio`);
    const reqRows = (reqs as unknown as { rows?: { slug: string; tipo: string }[] }).rows ?? (reqs as unknown as { slug: string; tipo: string }[]);
    const c: Ctx = { tx, roleId, reqDoc: Object.fromEntries(reqRows.map((r) => [r.slug, r.tipo])), logs: [] };

    // Roles habilitados por org (los del hotel pueden existir ya por demo-seed).
    const enable = async (orgId: string, slugs: string[]) => {
      await tx.insert(orgRoles).values(slugs.map((s) => ({ orgId, roleId: roleId[s]! }))).onConflictDoNothing();
      log(c, new Date(Date.now() - 74 * DAY), { orgId, actorId: root.id, accion: 'org.roles_set', entidad: 'org', entidadId: orgId });
    };
    await enable(hotelId, ['mesero', 'cocina', 'seguridad', 'conductor']);
    await enable(bistroId, ['mesero', 'cocina']);
    await enable(eventosId, ['mesero', 'seguridad']);
    for (const [orgId, by, d] of [[hotelId, laura, 70], [bistroId, camila, 52]] as const) {
      log(c, new Date(Date.now() - (d + 1) * DAY), { orgId, actorId: root.id, accion: 'org.created', entidad: 'org', entidadId: orgId });
      log(c, new Date(Date.now() - d * DAY), { orgId, actorId: by, accion: 'team.member_added', entidad: 'member', entidadId: by });
    }
    log(c, new Date(Date.now() - 41 * DAY), { orgId: hotelId, actorId: andres, accion: 'team.member_added', entidad: 'member', entidadId: andres });
    log(c, new Date(Date.now() - DAY), { orgId: eventosId, actorId: root.id, accion: 'org.created', entidad: 'org', entidadId: eventosId });

    const H_ = await seedBanca(c, hotelId, HOTEL, laura);
    const B_ = await seedBanca(c, bistroId, BISTRO, camila);

    // ---- Hotel: historial de tres semanas, próximos días ----
    const hotelShifts: ShiftSpec[] = [
      { rol: 'mesero', d: -20, h: 18, horas: 6, cupos: 3, estado: 'completado', notas: 'Banquete de bodas · salón principal', a: [['01', 'completed'], ['02', 'completed'], ['04', 'completed']], o: [['05', 'declined']] },
      { rol: 'cocina', d: -17, h: 6, horas: 8, cupos: 1, estado: 'completado', notas: 'Desayuno buffet', a: [['09', 'completed']] },
      { rol: 'seguridad', d: -14, h: 22, horas: 8, cupos: 1, estado: 'completado', notas: 'Portería norte', a: [['13', 'completed']] },
      { rol: 'mesero', d: -12, h: 19, horas: 5, cupos: 2, estado: 'completado', notas: 'Evento corporativo', a: [['03', 'completed'], ['06', 'no_show']], o: [['07', 'expired']] },
      { rol: 'conductor', d: -9, h: 20, horas: 6, cupos: 1, estado: 'completado', notas: 'Traslados aeropuerto', a: [['15', 'completed']] },
      { rol: 'mesero', d: -6, h: 12, horas: 6, cupos: 2, estado: 'completado', notas: 'Almuerzo dominical', a: [['05', 'completed'], ['07', 'disputed']] },
      { rol: 'cocina', d: -4, h: 18, horas: 6, cupos: 2, estado: 'completado', notas: 'Cena de gala', a: [['10', 'completed'], ['11', 'completed']] },
      { rol: 'mesero', d: -3, h: 7, horas: 5, cupos: 2, estado: 'vencido', notas: 'Desayuno de convención', o: [['04', 'expired'], ['06', 'declined']] },
      { rol: 'mesero', d: -2, h: 17, horas: 6, cupos: 1, estado: 'cancelado', notas: 'Coctel (cancelado por el cliente)' },
      { rol: 'cocina', d: 1, h: 6, horas: 8, cupos: 1, estado: 'cubierto', notas: 'Desayuno buffet', a: [['09', 'confirmed']], o: [['10', 'read'], ['11', 'declined']] },
      { rol: 'mesero', d: 3, h: 18, horas: 6, cupos: 3, estado: 'cubierto', notas: 'Cena de aniversario · 120 invitados', a: [['01', 'confirmed'], ['03', 'confirmed'], ['04', 'confirmed'], ['05', 'standby']], o: [['06', 'declined']] },
      { rol: 'seguridad', d: 2, h: 22, horas: 8, cupos: 1, estado: 'abierto', notas: 'Portería norte', o: [['13', 'read']] },
      { rol: 'conductor', d: 5, h: 19, horas: 6, cupos: 1, estado: 'abierto', notas: 'Ruta aeropuerto', o: [['15', 'delivered']] },
    ];
    const hs = [];
    for (const s of hotelShifts) hs.push(await seedShift(c, hotelId, s, H_, s.d > 0 && s.rol === 'mesero' ? andres : laura));

    // Disputas: Felipe contesta su inasistencia (abierta); Paula ganó la suya hace días (revertida = asistió).
    const fel = hs[5]!;
    const [dp] = await tx.insert(disputes).values({
      orgId: hotelId, assignmentId: fel.assignments['07']!, workerId: H_['07']!.workerId,
      motivo: 'Sí asistí: llegué a las 12:10 por un trancón y firmé la planilla en recepción.', createdAt: new Date(fel.inicio.getTime() + 20 * H),
    }).returning({ id: disputes.id });
    log(c, new Date(fel.inicio.getTime() + 20 * H), { orgId: hotelId, actorId: H_['07']!.workerId, accion: 'dispute.opened', entidad: 'dispute', entidadId: dp!.id });

    const mat = hs[3]!;
    await tx.update(assignments).set({ status: 'completed' }).where(eq(assignments.id, mat.assignments['06']!));
    await tx.insert(disputes).values({
      orgId: hotelId, assignmentId: mat.assignments['06']!, workerId: H_['06']!.workerId, estado: 'reversed',
      motivo: 'Estuve en el turno completo; el supervisor de salón puede confirmarlo.', nota: 'Confirmado con el supervisor de salón.',
      resueltoPor: laura, createdAt: new Date(mat.inicio.getTime() + DAY), resolvedAt: new Date(mat.inicio.getTime() + 2 * DAY),
    });

    // Alertas: disputa pendiente, turno vencido ya atendido, baja con turnos atendida.
    await tx.insert(alerts).values([
      { orgId: hotelId, tipo: 'disputa_abierta', shiftId: fel.shiftId, workerId: H_['07']!.workerId, createdAt: new Date(fel.inicio.getTime() + 20 * H) },
      { orgId: hotelId, tipo: 'turno_vencido', shiftId: hs[7]!.shiftId, createdAt: hs[7]!.inicio, atendidaAt: new Date(hs[7]!.inicio.getTime() + 2 * H), atendidaPor: laura },
      { orgId: hotelId, tipo: 'baja_con_turnos', workerId: H_['12']!.workerId, createdAt: new Date(Date.now() - 5 * DAY), atendidaAt: new Date(Date.now() - 5 * DAY + 3 * H), atendidaPor: andres },
    ]);

    // ---- Bistró: cuatro semanas más tranquilas ----
    const bistroShifts: ShiftSpec[] = [
      { rol: 'mesero', d: -15, h: 18, horas: 5, cupos: 2, estado: 'completado', notas: 'Noche de jazz', a: [['21', 'completed'], ['22', 'completed']] },
      { rol: 'cocina', d: -11, h: 11, horas: 6, cupos: 1, estado: 'completado', a: [['23', 'completed']] },
      { rol: 'mesero', d: -8, h: 19, horas: 5, cupos: 1, estado: 'completado', notas: 'Cena maridaje', a: [['01', 'completed']] },
      { rol: 'mesero', d: -5, h: 12, horas: 5, cupos: 2, estado: 'completado', a: [['21', 'completed'], ['22', 'no_show']] },
      { rol: 'cocina', d: 2, h: 11, horas: 6, cupos: 1, estado: 'cubierto', a: [['23', 'confirmed']], o: [['09', 'declined']] },
    ];
    for (const s of bistroShifts) await seedShift(c, bistroId, s, B_, camila);

    log(c, new Date(), { orgId: null, actorId: root.id, accion: 'feria.seeded', entidad: 'seed', entidadId: SEED_TAG });
    await tx.insert(auditLog).values(c.logs.sort((a, b) => a.at!.getTime() - b.at!.getTime()));
  });

  const live = await feriaLive(db);
  return { already: false as const, hotelId, bistroId, eventosId, live };
}

/**
 * Turno en curso para mostrar la vista en vivo: mesero esta noche (o en 2 h si ya es tarde), 2 cupos, dos rondas enviadas,
 * una persona aceptó, otra canceló su asistencia (alerta urgente) y el resto en distintos estados de entrega.
 * Se puede repetir: cancela el turno en vivo anterior y crea uno nuevo.
 */
export async function feriaLive(db: Db) {
  const [org] = await db.select({ id: organization.id }).from(organization).where(eq(organization.slug, 'hotel-demo'));
  if (!org) throw new Error('Corre primero feria-seed.');
  const orgId = org.id;
  return withSuper(db, async (tx) => {
    const prev = await tx.update(shifts).set({ estado: 'cancelado' })
      .where(and(eq(shifts.orgId, orgId), eq(shifts.createdBy, LIVE_TAG), inArray(shifts.estado, ['abierto', 'cubierto']))).returning({ id: shifts.id });
    if (prev.length) {
      const ids = prev.map((p) => p.id);
      await tx.update(shiftOffers).set({ status: 'cancelled' }).where(and(inArray(shiftOffers.shiftId, ids), inArray(shiftOffers.status, ['queued', 'sent', 'delivered', 'read'])));
      await tx.update(alerts).set({ atendidaAt: new Date(), atendidaPor: LIVE_TAG }).where(and(inArray(alerts.shiftId, ids), isNull(alerts.atendidaAt)));
    }

    const [mesero] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.slug, 'mesero'));
    const banca = await tx.select({ workerId: orgWorkers.workerId, nombre: orgWorkers.nombre })
      .from(orgWorkers).where(and(eq(orgWorkers.orgId, orgId), eq(orgWorkers.roleId, mesero!.id), eq(orgWorkers.estado, 'activo')));
    const by = (n: string) => banca.find((b) => b.nombre.startsWith(n))?.workerId;

    let inicio = bog(0, 22);
    if (inicio.getTime() - Date.now() < 2 * H) inicio = new Date(Math.ceil((Date.now() + 2 * H) / H) * H);
    const fin = new Date(inicio.getTime() + 6 * H);
    const { piso, pago } = await payFor(tx, inicio, fin, '1.2');
    const t0 = new Date(Date.now() - 4 * 60_000); // ronda 1 hace 4 min; ronda 2 hace 1 min
    const t1 = new Date(Date.now() - 60_000);
    const [s] = await tx.insert(shifts).values({
      orgId, roleId: mesero!.id, inicio, fin, cupos: 2, pagoTotal: pago, pisoCalculado: piso, estado: 'abierto',
      waveCount: 2, lastWaveAt: t1, notas: 'Salón principal · uniforme negro', createdBy: LIVE_TAG, createdAt: t0,
    }).returning({ id: shifts.id });
    const shiftId = s!.id;

    // [persona, ronda, estado de la oferta, canal, entregas]
    type D = [string, 'sent' | 'delivered' | 'read' | 'failed'];
    const plan: [string, number, string, string, D[]][] = [
      ['Ana María', 1, 'accepted', 'whatsapp', [['whatsapp', 'sent'], ['whatsapp', 'read']]],
      ['Juan Esteban', 1, 'accepted', 'whatsapp', [['whatsapp', 'sent'], ['whatsapp', 'read']]],
      ['Valentina', 1, 'read', 'whatsapp', [['whatsapp', 'sent'], ['whatsapp', 'read']]],
      ['Santiago', 2, 'delivered', 'telegram', [['whatsapp', 'failed'], ['telegram', 'sent'], ['telegram', 'delivered']]],
      ['Daniela', 2, 'sent', 'whatsapp', [['whatsapp', 'sent']]],
      ['Mateo', 2, 'undeliverable', 'email', [['whatsapp', 'failed'], ['email', 'failed']]],
      ['Felipe', 2, 'declined', 'whatsapp', [['whatsapp', 'sent'], ['whatsapp', 'read']]],
    ];
    const logs: (typeof auditLog.$inferInsert)[] = [
      { orgId, actorId: LIVE_TAG, accion: 'shift.created', entidad: 'shift', entidadId: shiftId, detalle: { cupos: 2 }, at: t0 },
      { orgId, actorId: 'system:offers', accion: 'shift.wave_sent', entidad: 'shift', entidadId: shiftId, detalle: { wave: 1, ofertas: 3 }, at: t0 },
      { orgId, actorId: 'system:offers', accion: 'shift.wave_sent', entidad: 'shift', entidadId: shiftId, detalle: { wave: 2, ofertas: 4 }, at: t1 },
    ];
    const offered = new Set<string>();
    for (const [name, wave, status, canal, entregas] of plan) {
      const workerId = by(name);
      if (!workerId) continue;
      offered.add(workerId);
      const at = wave === 1 ? t0 : t1;
      const answered = status === 'accepted' || status === 'declined';
      const [o] = await tx.insert(shiftOffers).values({
        orgId, shiftId, workerId, status, wave, canalUsado: canal, createdAt: at,
        respondedAt: answered ? new Date(at.getTime() + 50_000) : null, respondedCanal: answered ? canal : null,
      }).returning({ id: shiftOffers.id });
      await tx.insert(offerDeliveries).values(entregas.map(([ch, estado], i) => ({ orgId, offerId: o!.id, canal: ch, estado, at: new Date(at.getTime() + i * 15_000) })));
      if (status === 'accepted') {
        const cancelled = name === 'Juan Esteban';
        const [a] = await tx.insert(assignments).values({ orgId, shiftId, workerId, status: cancelled ? 'cancelled' : 'confirmed', acceptedAt: new Date(at.getTime() + 50_000) })
          .returning({ id: assignments.id });
        logs.push({ orgId, actorId: 'system:offers', accion: 'assignment.confirmed', entidad: 'assignment', entidadId: a!.id, at: new Date(at.getTime() + 50_000) });
        if (cancelled) {
          logs.push({ orgId, actorId: 'system:offers', accion: 'assignment.released', entidad: 'assignment', entidadId: a!.id, at: new Date(Date.now() - 90_000) });
          await tx.insert(alerts).values({ orgId, tipo: 'cancelacion_asistencia', urgente: true, shiftId, workerId, createdAt: new Date(Date.now() - 90_000) });
        }
      }
    }
    // El resto de meseros activos también tiene su oferta (ronda 2): así el worker no lanza oleadas a nadie más.
    for (const b of banca) {
      if (offered.has(b.workerId)) continue;
      const [o] = await tx.insert(shiftOffers).values({ orgId, shiftId, workerId: b.workerId, status: 'sent', wave: 2, canalUsado: 'whatsapp', createdAt: t1 })
        .returning({ id: shiftOffers.id });
      await tx.insert(offerDeliveries).values({ orgId, offerId: o!.id, canal: 'whatsapp', estado: 'sent', at: t1 });
    }
    await tx.insert(auditLog).values(logs);
    return { shiftId, inicio };
  });
}

/**
 * Registra a una persona REAL de la demo (tú) en una org: la agrega activa a la banca con su Telegram ya vinculado.
 * Equivale a ALTA + «Acepto» + `/start CÓDIGO`, para cuando WhatsApp no está disponible. El consentimiento queda
 * registrado como dado por el canal `telegram`: úsalo solo con tu propio celular o el de quien te lo pidió.
 */
export async function feriaLinkTelegram(db: Db, a: { orgSlug: string; celular: string; nombre: string; chatId: string; roleSlug: string }) {
  return withSuper(db, async (tx) => {
    const [o] = await tx
      .select({ id: orgs.id })
      .from(orgs)
      .innerJoin(organization, sql`${organization.id} = ${orgs.id}::text`)
      .where(eq(organization.slug, a.orgSlug));
    if (!o) throw new Error(`No existe la organización «${a.orgSlug}».`);
    const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.slug, a.roleSlug));
    if (!role) throw new Error(`No existe el rol «${a.roleSlug}».`);
    const r = await tx.execute(sql`SELECT ensure_worker(${a.celular}) AS id`);
    const workerId = ((r as unknown as { rows?: { id: string }[] }).rows ?? (r as unknown as { id: string }[]))[0]!.id;
    const [taken] = await tx.select({ w: workerChannels.workerId }).from(workerChannels)
      .where(and(eq(workerChannels.canal, 'telegram'), eq(workerChannels.identificador, a.chatId)));
    if (taken && taken.w !== workerId) throw new Error('Ese chat de Telegram ya está vinculado a otra persona.');
    await tx.insert(orgWorkers).values({ orgId: o.id, workerId, nombre: a.nombre, roleId: role.id, estado: 'activo' })
      .onConflictDoUpdate({ target: [orgWorkers.orgId, orgWorkers.workerId], set: { estado: 'activo', nombre: a.nombre, roleId: role.id } });
    const [c] = await tx.select({ id: workerConsents.id }).from(workerConsents)
      .where(and(eq(workerConsents.orgId, o.id), eq(workerConsents.workerId, workerId), isNull(workerConsents.revokedAt)));
    if (!c) await tx.insert(workerConsents).values({ orgId: o.id, workerId, termsVersionId: null, canal: 'telegram' });
    await tx.insert(workerChannels)
      .values({ workerId, canal: 'telegram', identificador: a.chatId, habilitado: true, prioridad: 20, verificadoAt: sql`now()` })
      .onConflictDoUpdate({ target: [workerChannels.workerId, workerChannels.canal], set: { identificador: a.chatId, habilitado: true, verificadoAt: sql`now()` } });
    return { workerId, orgId: o.id };
  });
}

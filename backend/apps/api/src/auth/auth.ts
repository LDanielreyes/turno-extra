import { randomUUID } from 'node:crypto';
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { organization as organizationPlugin, admin } from 'better-auth/plugins';
import { adminAc, userAc } from 'better-auth/plugins/admin/access';
import { hash, verify } from '@node-rs/argon2';
import { and, eq, gt, count } from 'drizzle-orm';
import type { Env } from '@turnoextra/shared';
import { audit, orgs, withOrg, user, session, account, verification, organization, member, invitation, type Db } from '@turnoextra/db';
import type { EmailProvider } from '../email.js';


export const MAX_ORG_ADMINS = 3;

export type AuthDeps = {
  db: Db;
  env: Pick<Env, 'BETTER_AUTH_SECRET' | 'BETTER_AUTH_URL' | 'APP_URL' | 'CORS_ORIGINS' | 'NODE_ENV'>;
  email: EmailProvider;
  /** Solo la CLI de arranque (primer super admin) puede crear usuarios sin invitación. */
  allowOpenSignup?: boolean;
};

/** Administradores actuales + invitaciones de administrador pendientes. */
export async function adminSlotsUsed(db: Db, organizationId: string): Promise<number> {
  const [m] = await db
    .select({ n: count() })
    .from(member)
    .where(and(eq(member.organizationId, organizationId), eq(member.role, 'admin')));
  const [i] = await db
    .select({ n: count() })
    .from(invitation)
    .where(
      and(
        eq(invitation.organizationId, organizationId),
        eq(invitation.role, 'admin'),
        eq(invitation.status, 'pending'),
        gt(invitation.expiresAt, new Date()),
      ),
    );
  return (m?.n ?? 0) + (i?.n ?? 0);
}

export function createAuth({ db, env, email, allowOpenSignup = false }: AuthDeps) {
  const secure = env.NODE_ENV === 'production';

  const requireAdminSlot = async (organizationId: string, role: string) => {
    if (role !== 'admin') return;
    if ((await adminSlotsUsed(db, organizationId)) >= MAX_ORG_ADMINS) {
      throw new APIError('BAD_REQUEST', { message: 'max_org_admins_exceeded' });
    }
  };

  const logAudit = (organizationId: string, actorId: string | null, accion: string, entidadId?: string) =>
    withOrg(db, organizationId, (tx) =>
      audit(tx, { orgId: organizationId, actorId, accion, entidad: 'member', entidadId }),
    );

  return betterAuth({
    appName: 'TurnoExtra',
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    trustedOrigins: [env.APP_URL, ...env.CORS_ORIGINS],
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: { user, session, account, verification, organization, member, invitation },
    }),
    advanced: {
      database: { generateId: () => randomUUID() },
      useSecureCookies: secure,
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure },
    },
    emailVerification: {
      sendOnSignUp: true,
      autoSignInAfterVerification: true,
      sendVerificationEmail: async ({ user: u, url }) => {
        await email.send({
          to: u.email,
          subject: 'Verifica tu correo en TurnoExtra',
          text: `Confirma tu correo para continuar:
${url}
`,
        });
      },
    },
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: true,
      minPasswordLength: 12,
      password: {
        hash: (password) => hash(password),
        verify: ({ hash: h, password }) => verify(h, password),
      },
    },
    rateLimit: {
      enabled: true,
      window: 60,
      max: 60,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 60, max: 5 },
        '/send-verification-email': { window: 60, max: 3 },
      },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (u) => {
            if (allowOpenSignup) return;
            // Sin registro abierto: solo quien tiene una invitación vigente puede crear cuenta.
            const [inv] = await db
              .select({ id: invitation.id })
              .from(invitation)
              .where(
                and(
                  eq(invitation.email, u.email.toLowerCase()),
                  eq(invitation.status, 'pending'),
                  gt(invitation.expiresAt, new Date()),
                ),
              )
              .limit(1);
            if (!inv) throw new APIError('FORBIDDEN', { message: 'signup_requires_invitation' });
          },
        },
      },
    },
    plugins: [
      organizationPlugin({
        allowUserToCreateOrganization: async (u) => (u as { role?: string }).role === 'super_admin',
        creatorRole: 'owner',
        invitationExpiresIn: 7 * 24 * 60 * 60,
        cancelPendingInvitationsOnReInvite: true,
        sendInvitationEmail: async (data) => {
          await email.send({
            to: data.email,
            subject: `Invitación a ${data.organization.name} en TurnoExtra`,
            text:
              `Te invitaron a administrar ${data.organization.name} en TurnoExtra.\n\n` +
              `Crea tu cuenta o inicia sesión y acepta la invitación aquí (vence en 7 días):\n` +
              `${env.APP_URL}/aceptar-invitacion/${data.id}\n`,
          });
        },
        organizationHooks: {
          afterCreateOrganization: async ({ organization: org, user: u }) => {
            await withOrg(db, org.id, async (tx) => {
              await tx.insert(orgs).values({ id: org.id, nombre: org.name });
              await audit(tx, { orgId: org.id, actorId: u.id, accion: 'org.created', entidad: 'org', entidadId: org.id });
            });
          },
          beforeCreateInvitation: async ({ invitation: inv }) => {
            if (inv.role !== 'admin') throw new APIError('BAD_REQUEST', { message: 'only_admin_role_invitable' });
            await requireAdminSlot(inv.organizationId, inv.role);
          },
          afterCreateInvitation: async ({ invitation: inv, inviter }) =>
            logAudit(inv.organizationId, inviter.id, 'team.invited', inv.id),
          beforeAddMember: async ({ member: m }) => requireAdminSlot(m.organizationId, m.role),
          // El propietario se agrega antes de existir la fila en orgs; lo cubre 'org.created'.
          afterAddMember: async ({ member: m, user: u }) => {
            if (m.role !== 'owner') await logAudit(m.organizationId, u.id, 'team.member_added', m.id);
          },
          afterAcceptInvitation: async ({ member: m, user: u }) =>
            logAudit(m.organizationId, u.id, 'team.member_added', m.id),
          afterRemoveMember: async ({ member: m, user: u }) =>
            logAudit(m.organizationId, u.id, 'team.member_removed', m.id),
        },
      }),
      admin({ roles: { super_admin: adminAc, user: userAc }, adminRoles: ['super_admin'], defaultRole: 'user' }),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;

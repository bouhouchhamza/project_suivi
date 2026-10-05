import type { Prisma, User } from '@prisma/client';
import { prisma } from './db.js';

type Actor = Pick<User, 'id' | 'name' | 'email'> | null | undefined;
type AuditDb = Prisma.TransactionClient | typeof prisma;

const SECRET_KEYS = /password|token|secret|hash|jwt/i;

function sanitize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key]) => !SECRET_KEYS.test(key))
        .map(([key, nested]) => [key, sanitize(nested)]),
    );
  }
  return value;
}

export async function recordAudit(
  actor: Actor,
  action: string,
  entityType: string,
  entityId?: string | null,
  metadata?: Record<string, unknown>,
  db: AuditDb = prisma,
) {
  await db.auditLog.create({
    data: {
      actorId: actor?.id ?? null,
      actorName: actor?.name ?? null,
      actorEmail: actor?.email ?? null,
      action,
      entityType,
      entityId: entityId ?? null,
      metadata: metadata ? sanitize(metadata) as Prisma.InputJsonValue : undefined,
    },
  });
}

export function diffProjectFields(before: any, after: any) {
  const changes: Record<string, { before: unknown; after: unknown }> = {};
  for (const field of ['numero', 'intitule', 'priorite', 'chef'] as const) {
    if (before[field] !== after[field]) changes[field] = { before: before[field], after: after[field] };
  }
  const beforeLines = new Map((before.lignes ?? []).map((line: any) => [line.departement, line]));
  for (const line of after.lignes ?? []) {
    const old = beforeLines.get(line.departement) as any;
    for (const field of ['phase', 'delaiJours', 'dateLivrable', 'commentaire'] as const) {
      if ((old?.[field] ?? null) !== (line[field] ?? null)) {
        changes[`${line.departement}.${field}`] = { before: old?.[field] ?? null, after: line[field] ?? null };
      }
    }
  }
  return changes;
}

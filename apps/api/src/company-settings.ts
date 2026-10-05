import { z } from 'zod';
import type { Prisma } from '@prisma/client';
import { config } from './config.js';
import { prisma } from './db.js';
import { validateClientSlug } from './domain.js';

type CompanySettingsDb = Pick<typeof prisma, 'companySettings'> | Prisma.TransactionClient;

export const companySettingsSchema = z.object({
  clientName: z.string().trim().min(2).max(160),
  clientSlug: z.string().trim().toLowerCase().refine(validateClientSlug, 'CLIENT_SLUG invalide.'),
  appDomain: z.string().trim().min(3).max(160),
  supportEmail: z.string().trim().email(),
  companyLogo: z.string().trim().max(2000).nullable().optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  timezone: z.string().trim().min(2).max(80),
});

export async function getCompanySettings(db: CompanySettingsDb = prisma) {
  const stored = await db.companySettings.findUnique({ where: { id: 'default' } });
  return stored ?? config.publicClient;
}

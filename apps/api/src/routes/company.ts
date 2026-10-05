import { Router } from 'express';
import { Role } from '@prisma/client';
import { allowRoles, requireAuth } from '../auth.js';
import { prisma } from '../db.js';
import { recordAudit } from '../audit.js';
import { companySettingsSchema, getCompanySettings } from '../company-settings.js';

export const companyRouter = Router();

companyRouter.get('/config', async (_req, res) => {
  res.json({ data: await getCompanySettings() });
});

companyRouter.get('/settings', requireAuth, allowRoles(Role.admin), async (_req, res) => {
  res.json({ data: await getCompanySettings() });
});

companyRouter.put('/settings', requireAuth, allowRoles(Role.admin), async (req, res) => {
  const parsed = companySettingsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Paramètres entreprise invalides.', errors: parsed.error.flatten() });
  const data = {
    ...parsed.data,
    companyLogo: parsed.data.companyLogo || null,
  };
  const settings = await prisma.companySettings.upsert({
    where: { id: 'default' },
    update: data,
    create: { id: 'default', ...data },
  });
  await recordAudit(req.user!, 'company_settings_changed', 'company_settings', settings.id, {
    clientName: settings.clientName,
    clientSlug: settings.clientSlug,
    appDomain: settings.appDomain,
    supportEmail: settings.supportEmail,
    primaryColor: settings.primaryColor,
    timezone: settings.timezone,
  });
  res.json({ data: settings });
});

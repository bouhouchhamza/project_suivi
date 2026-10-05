import { Router } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { allowRoles, requireAuth } from '../auth.js';
import { prisma } from '../db.js';
import { normalizeManager } from '../domain.js';
import { io } from '../socket.js';
import { recordAudit } from '../audit.js';

export const managersRouter = Router();
managersRouter.use(requireAuth, allowRoles(Role.admin, Role.editor, Role.viewer));
managersRouter.get('/', async (_req, res) => res.json({ data: await prisma.manager.findMany({ orderBy: { createdAt: 'asc' } }) }));
managersRouter.post('/', allowRoles(Role.admin, Role.editor), async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Nom du chef invalide.' });
  const normalized = normalizeManager(parsed.data.name);
  const manager = await prisma.manager.upsert({ where: { normalized }, update: {}, create: { name: parsed.data.name.trim().replace(/\s+/g,' '), normalized } });
  await recordAudit(req.user!, 'manager_added', 'manager', manager.id, { name: manager.name });
  io?.emit('managers:changed');
  res.status(201).json({ data: manager });
});

import { Router } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { allowRoles, requireAuth } from '../auth.js';
import { prisma } from '../db.js';

export const auditLogsRouter = Router();
auditLogsRouter.use(requireAuth, allowRoles(Role.admin));

auditLogsRouter.get('/', async (req, res) => {
  const parsed = z.object({
    user: z.string().optional(),
    action: z.string().optional(),
    project: z.string().optional(),
    from: z.string().optional(),
    to: z.string().optional(),
  }).safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ message: 'Filtres invalides.' });
  const where: any = {};
  if (parsed.data.user) where.actorId = parsed.data.user;
  if (parsed.data.action) where.action = parsed.data.action;
  if (parsed.data.project) {
    where.entityType = 'project';
    where.entityId = parsed.data.project;
  }
  if (parsed.data.from || parsed.data.to) {
    where.createdAt = {};
    if (parsed.data.from) where.createdAt.gte = new Date(parsed.data.from);
    if (parsed.data.to) where.createdAt.lte = new Date(parsed.data.to);
  }
  const data = await prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300 });
  res.json({ data });
});

import { Router } from 'express';
import { Role } from '@prisma/client';
import { z } from 'zod';
import { allowRoles, requireAuth } from '../auth.js';
import { prisma } from '../db.js';
import { savedViewFiltersSchema } from '../domain.js';

export const savedViewsRouter = Router();
savedViewsRouter.use(requireAuth, allowRoles(Role.admin, Role.editor, Role.viewer));

savedViewsRouter.get('/', async (req, res) => {
  const data = await prisma.savedView.findMany({ where: { userId: req.user!.id }, orderBy: { name: 'asc' } });
  res.json({ data });
});

savedViewsRouter.post('/', async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120), filters: savedViewFiltersSchema }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Vue enregistrée invalide.', errors: parsed.error.flatten() });
  const data = await prisma.savedView.upsert({
    where: { userId_name: { userId: req.user!.id, name: parsed.data.name } },
    update: { filters: parsed.data.filters },
    create: { userId: req.user!.id, name: parsed.data.name, filters: parsed.data.filters },
  });
  res.status(201).json({ data });
});

savedViewsRouter.patch('/:id', async (req, res) => {
  const parsed = z.object({ name: z.string().trim().min(2).max(120) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Nom invalide.' });
  const updated = await prisma.savedView.updateMany({ where: { id: req.params.id, userId: req.user!.id }, data: { name: parsed.data.name } });
  if (updated.count !== 1) return res.status(404).json({ message: 'Vue enregistrée introuvable.' });
  const data = await prisma.savedView.findUniqueOrThrow({ where: { id: req.params.id } });
  res.json({ data });
});

savedViewsRouter.delete('/:id', async (req, res) => {
  const deleted = await prisma.savedView.deleteMany({ where: { id: req.params.id, userId: req.user!.id } });
  if (deleted.count !== 1) return res.status(404).json({ message: 'Vue enregistrée introuvable.' });
  res.status(204).end();
});

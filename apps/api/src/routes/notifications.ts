import { Router } from 'express';
import { Role } from '@prisma/client';
import { allowRoles, requireAuth } from '../auth.js';
import { prisma } from '../db.js';
import { daysUntil, serializeProject } from '../domain.js';

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth, allowRoles(Role.admin, Role.editor, Role.viewer));

async function ensureDeadlineNotifications(userId: string) {
  const projects = (await prisma.project.findMany({ where: { archivedAt: null }, include: { lignes: true } })).map(serializeProject);
  for (const project of projects) {
    for (const line of project.lignes) {
      const days = daysUntil(line.dateLivrable);
      if (days === null || ![-1, 0, 1, 3].includes(days)) continue;
      const label = days < 0 ? 'en retard' : days === 0 ? 'aujourd’hui' : days === 1 ? 'demain' : 'dans 3 jours';
      await prisma.notification.upsert({
        where: { userId_dedupeKey: { userId, dedupeKey: `deadline:${project.id}:${line.departement}:${line.dateLivrable}:${days}` } },
        update: {},
        create: {
          userId,
          dedupeKey: `deadline:${project.id}:${line.departement}:${line.dateLivrable}:${days}`,
          projectId: project.id,
          type: days < 0 ? 'deadline_overdue' : 'deadline_upcoming',
          title: `Livrable ${label}`,
          message: `${project.numero} - ${project.intitule} / ${line.departement}`,
        },
      });
    }
  }
}

notificationsRouter.get('/', async (req, res) => {
  await ensureDeadlineNotifications(req.user!.id);
  const data = await prisma.notification.findMany({ where: { userId: req.user!.id }, orderBy: { createdAt: 'desc' }, take: 100 });
  res.json({ data });
});

notificationsRouter.patch('/:id/read', async (req, res) => {
  const notification = await prisma.notification.updateMany({ where: { id: req.params.id, userId: req.user!.id }, data: { readAt: new Date() } });
  if (notification.count !== 1) return res.status(404).json({ message: 'Notification introuvable.' });
  res.json({ success: true });
});

notificationsRouter.post('/read-all', async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id, readAt: null }, data: { readAt: new Date() } });
  res.json({ success: true });
});

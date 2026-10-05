import { Router } from 'express';
import { Role } from '@prisma/client';
import { allowRoles, requireAuth } from '../auth.js';
import { prisma } from '../db.js';
import { seedBusinessData } from '../seed-data.js';
import { io } from '../socket.js';

export const adminRouter = Router();
adminRouter.use(requireAuth,allowRoles(Role.admin));
adminRouter.get('/status', async (_req,res) => res.json({projectCount:await prisma.project.count({ where: { archivedAt: null } })}));
adminRouter.post('/seed', async (req,res) => {
  if (await prisma.project.count()) return res.status(409).json({message:'La base contient déjà des projets.'});
  const count = await seedBusinessData(req.user!.id);
  io?.emit('projects:reload');
  io?.emit('managers:changed');
  res.json({count});
});

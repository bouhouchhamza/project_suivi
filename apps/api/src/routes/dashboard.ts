import { Router } from 'express';
import { Role } from '@prisma/client';
import { allowRoles, requireAuth } from '../auth.js';
import { prisma } from '../db.js';
import { isActiveProject, projectKpis, serializeProject } from '../domain.js';

export const dashboardRouter = Router();
dashboardRouter.use(requireAuth, allowRoles(Role.admin, Role.editor, Role.viewer));

dashboardRouter.get('/', async (_req, res) => {
  const projects = (await prisma.project.findMany({ include: { lignes: true }, orderBy: { createdAt: 'asc' } })).map(serializeProject);
  const active = projects.filter(isActiveProject);
  const byChef = Object.values(active.reduce((acc: Record<string, any>, project) => {
    const key = project.chef || 'Sans chef';
    acc[key] ??= { label: key, count: 0 };
    acc[key].count += 1;
    return acc;
  }, {})).sort((a: any, b: any) => b.count - a.count);
  const byPriority = Object.values(active.reduce((acc: Record<string, any>, project) => {
    const key = project.priorite || 'Sans priorité';
    acc[key] ??= { label: key, count: 0 };
    acc[key].count += 1;
    return acc;
  }, {}));
  const byDepartment = Object.values(active.flatMap(p => p.lignes).reduce((acc: Record<string, any>, line) => {
    acc[line.departement] ??= { label: line.departement, deliverables: 0 };
    if (line.dateLivrable) acc[line.departement].deliverables += 1;
    return acc;
  }, {}));
  res.json({ data: { kpis: projectKpis(projects), byChef, byPriority, byDepartment } });
});

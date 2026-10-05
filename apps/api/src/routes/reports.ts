import { Router } from 'express';
import { Role } from '@prisma/client';
import { allowRoles, requireAuth } from '../auth.js';
import { prisma } from '../db.js';
import { isActiveProject, projectHasOverdueDeliverable, projectKpis, serializeProject } from '../domain.js';
import { getCompanySettings } from '../company-settings.js';

export const reportsRouter = Router();
reportsRouter.use(requireAuth, allowRoles(Role.admin, Role.editor, Role.viewer));

reportsRouter.get('/management', async (_req, res) => {
  const projects = (await prisma.project.findMany({ include: { lignes: true }, orderBy: { numero: 'asc' } })).map(serializeProject);
  const activeProjects = projects.filter(isActiveProject);
  res.json({
    data: {
      company: await getCompanySettings(),
      generatedAt: new Date().toISOString(),
      kpis: projectKpis(projects),
      overdueProjects: activeProjects.filter(project => projectHasOverdueDeliverable(project)),
      highPriorityProjects: activeProjects.filter(p => p.priorite === 'HAUTE'),
    },
  });
});

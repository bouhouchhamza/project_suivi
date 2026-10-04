import { Router, raw } from 'express';
import { Role } from '@prisma/client';
import { allowRoles, requireAuth } from '../auth.js';
import { prisma } from '../db.js';

export const excelTemplateRouter = Router();
excelTemplateRouter.use(requireAuth, allowRoles(Role.admin, Role.editor, Role.viewer));

const TEMPLATE_ID = 'current';

function decodeFilename(header: unknown, fallback: string) {
  if (typeof header !== 'string' || !header) return fallback;
  try { return decodeURIComponent(header); } catch { return fallback; }
}

excelTemplateRouter.get('/', async (_req, res) => {
  const template = await prisma.excelTemplate.findUnique({ where: { id: TEMPLATE_ID } });
  if (!template) return res.status(404).json({ message: 'Aucun modèle Excel enregistré.' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('X-Template-Filename', encodeURIComponent(template.filename));
  res.send(Buffer.from(template.content));
});

excelTemplateRouter.put('/', allowRoles(Role.admin, Role.editor), raw({ type: '*/*', limit: '15mb' }), async (req, res) => {
  if (!Buffer.isBuffer(req.body) || !req.body.length) return res.status(400).json({ message: 'Fichier Excel manquant.' });
  const filename = decodeFilename(req.headers['x-template-filename'], 'import.xlsx');
  const content = new Uint8Array(req.body);
  await prisma.excelTemplate.upsert({
    where: { id: TEMPLATE_ID },
    update: { filename, content, uploadedAt: new Date(), uploadedBy: req.user!.id },
    create: { id: TEMPLATE_ID, filename, content, uploadedBy: req.user!.id },
  });
  res.status(204).end();
});

import { Router } from 'express';
import { Prisma, Role } from '@prisma/client';
import { z } from 'zod';
import { allowRoles, requireAuth } from '../auth.js';
import { prisma } from '../db.js';
import { normalizeManager, projectSchema, sameImportProjectKey, serializeProject, toDate } from '../domain.js';
import { io } from '../socket.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth, allowRoles(Role.admin, Role.editor, Role.viewer));
const include = { lignes: true } as const;
const routeId = (id: string | string[] | undefined) => Array.isArray(id) ? id[0] : id;

class ProjectConflict extends Error {
  constructor(public serverProject: any) { super('PROJECT_CONFLICT'); }
}

projectsRouter.get('/', async (_req,res) => {
  const data = await prisma.project.findMany({ include, orderBy:{createdAt:'asc'} });
  res.json({data:data.map(serializeProject)});
});

projectsRouter.post('/', allowRoles(Role.admin,Role.editor), async (req,res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({message:'Projet invalide.',errors:parsed.error.flatten()});
  const p = parsed.data;
  const project = await prisma.$transaction(async tx => {
    if (p.chef) {
      const normalized = normalizeManager(p.chef);
      await tx.manager.upsert({where:{normalized},update:{},create:{name:p.chef,normalized}});
    }
    return tx.project.create({
      data:{
        numero:p.numero,intitule:p.intitule,priorite:p.priorite,chef:p.chef,updatedBy:req.user!.id,
        lignes:{create:p.lignes.map(l=>({...l,dateLivrable:toDate(l.dateLivrable)}))}
      },
      include
    });
  });
  const out = serializeProject(project);
  io?.emit('project:created', out);
  res.status(201).json({data:out});
});

projectsRouter.put('/:id', allowRoles(Role.admin,Role.editor), async (req,res) => {
  const id = routeId(req.params.id);
  if (!id) return res.status(400).json({message:'Identifiant de projet invalide.'});
  const body = z.object({baseUpdatedAt:z.string().datetime(),force:z.boolean().optional(),project:projectSchema}).safeParse(req.body);
  if (!body.success) return res.status(400).json({message:'Modification invalide.',errors:body.error.flatten()});
  const p = body.data.project;
  try {
    const updated = await prisma.$transaction(async tx => {
      const current = await tx.project.findUnique({where:{id},include});
      if (!current) throw Object.assign(new Error('NOT_FOUND'), { code:'NOT_FOUND' });
      if (!body.data.force && current.updatedAt.toISOString() !== body.data.baseUpdatedAt) throw new ProjectConflict(serializeProject(current));

      if (p.chef) {
        const normalized = normalizeManager(p.chef);
        await tx.manager.upsert({where:{normalized},update:{},create:{name:p.chef,normalized}});
      }

      if (!body.data.force) {
        const claim = await tx.project.updateMany({
          where:{id,updatedAt:new Date(body.data.baseUpdatedAt)},
          data:{numero:p.numero,intitule:p.intitule,priorite:p.priorite,chef:p.chef,updatedBy:req.user!.id,updatedAt:new Date()}
        });
        if (claim.count !== 1) {
          const latest = await tx.project.findUnique({where:{id},include});
          if (!latest) throw Object.assign(new Error('NOT_FOUND'), { code:'NOT_FOUND' });
          throw new ProjectConflict(serializeProject(latest));
        }
      } else {
        await tx.project.update({where:{id},data:{numero:p.numero,intitule:p.intitule,priorite:p.priorite,chef:p.chef,updatedBy:req.user!.id,updatedAt:new Date()}});
      }

      await tx.projectLine.deleteMany({where:{projectId:id}});
      await tx.projectLine.createMany({
        data:p.lignes.map(l=>({projectId:id,departement:l.departement,phase:l.phase,delaiJours:l.delaiJours,dateLivrable:toDate(l.dateLivrable),commentaire:l.commentaire}))
      });
      return tx.project.findUniqueOrThrow({where:{id},include});
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const out = serializeProject(updated);
    io?.emit('project:updated', out);
    res.json({data:out});
  } catch (e:any) {
    if (e instanceof ProjectConflict) return res.status(409).json({code:'PROJECT_CONFLICT',message:'Ce projet a été modifié par un collègue.',serverProject:e.serverProject});
    if (e?.code === 'NOT_FOUND') return res.status(404).json({message:'Projet introuvable.'});
    if (e?.code === 'P2034') return res.status(409).json({code:'PROJECT_CONFLICT',message:'Conflit de modification. Rechargez la version la plus récente.'});
    throw e;
  }
});

projectsRouter.delete('/:id', allowRoles(Role.admin,Role.editor), async (req,res) => {
  const id = routeId(req.params.id);
  if (!id) return res.status(400).json({message:'Identifiant de projet invalide.'});
  const parsed = z.object({baseUpdatedAt:z.string().datetime(),force:z.boolean().optional()}).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({message:'Suppression invalide.'});
  try {
    await prisma.$transaction(async tx => {
      const current = await tx.project.findUnique({where:{id},include});
      if (!current) throw Object.assign(new Error('NOT_FOUND'), { code:'NOT_FOUND' });
      if (!parsed.data.force && current.updatedAt.toISOString() !== parsed.data.baseUpdatedAt) throw new ProjectConflict(serializeProject(current));
      if (parsed.data.force) {
        await tx.project.delete({where:{id}});
      } else {
        const deleted = await tx.project.deleteMany({where:{id,updatedAt:new Date(parsed.data.baseUpdatedAt)}});
        if (deleted.count !== 1) {
          const latest = await tx.project.findUnique({where:{id},include});
          if (latest) throw new ProjectConflict(serializeProject(latest));
          throw Object.assign(new Error('NOT_FOUND'), { code:'NOT_FOUND' });
        }
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    io?.emit('project:deleted',{id});
    res.status(204).end();
  } catch (e:any) {
    if (e instanceof ProjectConflict) return res.status(409).json({code:'PROJECT_CONFLICT',message:'Ce projet a été modifié par un collègue.',serverProject:e.serverProject});
    if (e?.code === 'NOT_FOUND') return res.status(404).json({message:'Projet introuvable.'});
    if (e?.code === 'P2034') return res.status(409).json({code:'PROJECT_CONFLICT',message:'Conflit de suppression. Rechargez la version la plus récente.'});
    throw e;
  }
});

projectsRouter.post('/import/bulk', allowRoles(Role.admin,Role.editor), async (req,res) => {
  const schema = z.object({mode:z.enum(['replace','merge']),projects:z.array(projectSchema).max(5000),managers:z.array(z.string().trim().min(2).max(120)).default([])});
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({message:'Fichier importé invalide.',errors:parsed.error.flatten()});

  const count = await prisma.$transaction(async tx => {
    for (const rawName of parsed.data.managers) {
      const name = rawName.trim().replace(/\s+/g,' ');
      const normalized = normalizeManager(name);
      await tx.manager.upsert({where:{normalized},update:{},create:{name,normalized}});
    }
    if (parsed.data.mode === 'replace') await tx.project.deleteMany();

    let processed = 0;
    for (const p of parsed.data.projects) {
      if (p.chef) {
        const normalized = normalizeManager(p.chef);
        await tx.manager.upsert({where:{normalized},update:{},create:{name:p.chef,normalized}});
      }
      let existingId: string | null = null;
      if (parsed.data.mode === 'merge') {
        const sameNumero = await tx.project.findMany({where:{numero:p.numero},select:{id:true,numero:true,intitule:true}});
        existingId = sameNumero.find(x=>sameImportProjectKey(x,p))?.id ?? null;
      }
      if (existingId) {
        await tx.project.update({where:{id:existingId},data:{intitule:p.intitule,priorite:p.priorite,chef:p.chef,updatedBy:req.user!.id,updatedAt:new Date()}});
        await tx.projectLine.deleteMany({where:{projectId:existingId}});
        await tx.projectLine.createMany({data:p.lignes.map(l=>({projectId:existingId,departement:l.departement,phase:l.phase,delaiJours:l.delaiJours,dateLivrable:toDate(l.dateLivrable),commentaire:l.commentaire}))});
      } else {
        await tx.project.create({data:{numero:p.numero,intitule:p.intitule,priorite:p.priorite,chef:p.chef,updatedBy:req.user!.id,lignes:{create:p.lignes.map(l=>({...l,dateLivrable:toDate(l.dateLivrable)}))}}});
      }
      processed++;
    }
    return processed;
  }, { timeout:120000 });

  io?.emit('projects:reload');
  io?.emit('managers:changed');
  res.json({count});
});

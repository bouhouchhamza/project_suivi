import { Router } from 'express';
import { Prisma, Priority, Role } from '@prisma/client';
import { z } from 'zod';
import { allowRoles, requireAuth } from '../auth.js';
import { prisma } from '../db.js';
import { compareProjectOrder, normalizeManager, projectSchema, sameImportProjectKey, serializeProject, toDate } from '../domain.js';
import { io } from '../socket.js';
import { diffProjectFields, recordAudit } from '../audit.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth, allowRoles(Role.admin, Role.editor, Role.viewer));
const include = { lignes: true } as const;
const routeId = (id: string | string[] | undefined) => Array.isArray(id) ? id[0] : id;

class ProjectConflict extends Error {
  constructor(public serverProject: any) { super('PROJECT_CONFLICT'); }
}

async function nextPriorityOrder(tx: Prisma.TransactionClient, priorite: Priority | null) {
  const agg = await tx.project.aggregate({ where: { priorite }, _max: { priorityOrder: true } });
  return (agg._max.priorityOrder ?? -1) + 1;
}

projectsRouter.get('/', async (req,res) => {
  const archived = req.query.archived === 'true';
  const all = req.query.archived === 'all';
  const where = all ? {} : { archivedAt: archived ? { not: null } : null };
  const data = await prisma.project.findMany({ where, include });
  res.json({data:data.sort(compareProjectOrder).map(serializeProject)});
});

projectsRouter.post('/', allowRoles(Role.admin,Role.editor), async (req,res) => {
  const parsed = projectSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({message:'Projet invalide.',errors:parsed.error.flatten()});
  const p = parsed.data;
  try {
    const project = await prisma.$transaction(async tx => {
      if (p.chef) {
        const normalized = normalizeManager(p.chef);
        await tx.manager.upsert({where:{normalized},update:{},create:{name:p.chef,normalized}});
      }
      const priorityOrder = await nextPriorityOrder(tx, p.priorite);
      return tx.project.create({
        data:{
          numero:p.numero,intitule:p.intitule,priorite:p.priorite,priorityOrder,chef:p.chef,updatedBy:req.user!.id,
          lignes:{create:p.lignes.map(l=>({...l,dateLivrable:toDate(l.dateLivrable)}))}
        },
        include
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    const out = serializeProject(project);
    await recordAudit(req.user!, 'project_created', 'project', project.id, { numero: out.numero, intitule: out.intitule });
    io?.emit('project:created', out);
    res.status(201).json({data:out});
  } catch (e:any) {
    if (e?.code === 'P2034') return res.status(409).json({message:'Conflit de création. Veuillez réessayer.'});
    throw e;
  }
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

      const priorityChanged = current.priorite !== p.priorite;
      const priorityOrder = priorityChanged ? await nextPriorityOrder(tx, p.priorite) : undefined;

      if (!body.data.force) {
        const claim = await tx.project.updateMany({
          where:{id,updatedAt:new Date(body.data.baseUpdatedAt)},
          data:{numero:p.numero,intitule:p.intitule,priorite:p.priorite,...(priorityOrder!==undefined?{priorityOrder}:{}),chef:p.chef,updatedBy:req.user!.id,updatedAt:new Date()}
        });
        if (claim.count !== 1) {
          const latest = await tx.project.findUnique({where:{id},include});
          if (!latest) throw Object.assign(new Error('NOT_FOUND'), { code:'NOT_FOUND' });
          throw new ProjectConflict(serializeProject(latest));
        }
      } else {
        await tx.project.update({where:{id},data:{numero:p.numero,intitule:p.intitule,priorite:p.priorite,...(priorityOrder!==undefined?{priorityOrder}:{}),chef:p.chef,updatedBy:req.user!.id,updatedAt:new Date()}});
      }

      await tx.projectLine.deleteMany({where:{projectId:id}});
      await tx.projectLine.createMany({
        data:p.lignes.map(l=>({projectId:id,departement:l.departement,phase:l.phase,delaiJours:l.delaiJours,dateLivrable:toDate(l.dateLivrable),commentaire:l.commentaire}))
      });
      const next = await tx.project.findUniqueOrThrow({where:{id},include});
      await recordAudit(req.user!, 'project_edited', 'project', id, { changes: diffProjectFields(serializeProject(current), serializeProject(next)) }, tx);
      return next;
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

projectsRouter.post('/:id/restore', allowRoles(Role.admin), async (req,res) => {
  const id = routeId(req.params.id);
  if (!id) return res.status(400).json({message:'Identifiant de projet invalide.'});
  const project = await prisma.project.update({where:{id},data:{archivedAt:null,archivedBy:null,updatedBy:req.user!.id},include});
  await recordAudit(req.user!, 'project_restored', 'project', id, { numero: project.numero, intitule: project.intitule });
  const out = serializeProject(project);
  io?.emit('project:restored', out);
  io?.emit('projects:reload');
  res.json({data:out});
});

projectsRouter.delete('/:id/permanent', allowRoles(Role.admin), async (req,res) => {
  const id = routeId(req.params.id);
  if (!id) return res.status(400).json({message:'Identifiant de projet invalide.'});
  const parsed = z.object({confirmation:z.string()}).safeParse(req.body);
  if (!parsed.success || parsed.data.confirmation !== 'SUPPRIMER DEFINITIVEMENT') return res.status(400).json({message:'Confirmation forte requise.'});
  const current = await prisma.project.findUnique({where:{id},include});
  if (!current) return res.status(404).json({message:'Projet introuvable.'});
  if (!current.archivedAt) return res.status(409).json({message:'Archivez le projet avant suppression définitive.'});
  await prisma.project.delete({where:{id}});
  await recordAudit(req.user!, 'project_permanently_deleted', 'project', id, { numero: current.numero, intitule: current.intitule });
  io?.emit('project:deleted',{id});
  io?.emit('projects:reload');
  res.status(204).end();
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
      const archiveData = { archivedAt:new Date(), archivedBy:req.user!.id, updatedBy:req.user!.id, updatedAt:new Date() };
      if (parsed.data.force) {
        await tx.project.update({where:{id},data:archiveData});
      } else {
        const archived = await tx.project.updateMany({where:{id,updatedAt:new Date(parsed.data.baseUpdatedAt)},data:archiveData});
        if (archived.count !== 1) {
          const latest = await tx.project.findUnique({where:{id},include});
          if (latest) throw new ProjectConflict(serializeProject(latest));
          throw Object.assign(new Error('NOT_FOUND'), { code:'NOT_FOUND' });
        }
      }
      await recordAudit(req.user!, 'project_archived', 'project', id, { numero: current.numero, intitule: current.intitule }, tx);
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    io?.emit('project:archived',{id});
    io?.emit('projects:reload');
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
    if (parsed.data.mode === 'replace') {
      await tx.project.updateMany({ where: { archivedAt: null }, data: { archivedAt: new Date(), archivedBy: req.user!.id, updatedBy: req.user!.id } });
    }

    const orderKey = (pr: Priority | null) => pr ?? 'NONE';
    const orderCounters = new Map<string, number>();
    for (const pr of [Priority.HAUTE, Priority.MOYENNE, Priority.BASSE, null]) {
      const agg = await tx.project.aggregate({ where:{priorite:pr}, _max:{priorityOrder:true} });
      orderCounters.set(orderKey(pr), agg._max.priorityOrder ?? -1);
    }
    const nextOrder = (pr: Priority | null) => {
      const key = orderKey(pr);
      const value = (orderCounters.get(key) ?? -1) + 1;
      orderCounters.set(key, value);
      return value;
    };

    let processed = 0;
    for (const p of parsed.data.projects) {
      if (p.chef) {
        const normalized = normalizeManager(p.chef);
        await tx.manager.upsert({where:{normalized},update:{},create:{name:p.chef,normalized}});
      }
      let existing: { id: string; priorite: Priority | null } | null = null;
      if (parsed.data.mode === 'merge') {
        const sameNumero = await tx.project.findMany({where:{numero:p.numero,archivedAt:null},select:{id:true,numero:true,intitule:true,priorite:true}});
        existing = sameNumero.find(x=>sameImportProjectKey(x,p)) ?? null;
      }
      if (existing) {
        const priorityOrder = existing.priorite === p.priorite ? undefined : nextOrder(p.priorite);
        await tx.project.update({where:{id:existing.id},data:{intitule:p.intitule,priorite:p.priorite,...(priorityOrder!==undefined?{priorityOrder}:{}),chef:p.chef,updatedBy:req.user!.id,updatedAt:new Date()}});
        await tx.projectLine.deleteMany({where:{projectId:existing.id}});
        await tx.projectLine.createMany({data:p.lignes.map(l=>({projectId:existing!.id,departement:l.departement,phase:l.phase,delaiJours:l.delaiJours,dateLivrable:toDate(l.dateLivrable),commentaire:l.commentaire}))});
      } else {
        const priorityOrder = nextOrder(p.priorite);
        await tx.project.create({data:{numero:p.numero,intitule:p.intitule,priorite:p.priorite,priorityOrder,chef:p.chef,updatedBy:req.user!.id,lignes:{create:p.lignes.map(l=>({...l,dateLivrable:toDate(l.dateLivrable)}))}}});
      }
      processed++;
    }
    return processed;
  }, { timeout:120000 });

  await recordAudit(req.user!, 'excel_import', 'project', null, { mode: parsed.data.mode, count });
  io?.emit('projects:reload');
  io?.emit('managers:changed');
  res.json({count});
});

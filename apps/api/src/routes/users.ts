import { Router } from 'express';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { allowRoles, requireAuth } from '../auth.js';
import { prisma } from '../db.js';
import { wouldRemoveLastAdmin } from '../domain.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, allowRoles(Role.admin));
const routeId = (id: string | string[] | undefined) => Array.isArray(id) ? id[0] : id;

usersRouter.get('/', async (_req, res) => {
  const data = await prisma.user.findMany({ select:{id:true,name:true,email:true,role:true,createdAt:true}, orderBy:{name:'asc'} });
  res.json({data});
});

usersRouter.post('/', async (req, res) => {
  const parsed = z.object({name:z.string().trim().min(2).max(120),email:z.string().email(),password:z.string().min(8).max(100),role:z.nativeEnum(Role)}).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({message:'Données utilisateur invalides.',errors:parsed.error.flatten()});
  try {
    const user = await prisma.user.create({data:{name:parsed.data.name,email:parsed.data.email.toLowerCase(),passwordHash:await bcrypt.hash(parsed.data.password,12),role:parsed.data.role}});
    res.status(201).json({data:{id:user.id,name:user.name,email:user.email,role:user.role}});
  } catch (e:any) {
    if (e?.code === 'P2002') return res.status(409).json({message:'Cet email existe déjà.'});
    throw e;
  }
});

const updateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(190).optional(),
  role: z.nativeEnum(Role).optional(),
}).refine(d => d.name !== undefined || d.email !== undefined || d.role !== undefined, {message:'Aucune modification fournie.'});

usersRouter.patch('/:id', async (req,res) => {
  const id = routeId(req.params.id);
  if (!id) return res.status(400).json({message:'Identifiant utilisateur invalide.'});
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({message:'Données utilisateur invalides.',errors:parsed.error.flatten()});
  const target = await prisma.user.findUnique({where:{id}});
  if (!target) return res.status(404).json({message:'Utilisateur introuvable.'});
  if (parsed.data.role !== undefined && parsed.data.role !== target.role) {
    const admins = await prisma.user.count({where:{role:Role.admin}});
    if (wouldRemoveLastAdmin(target.role, parsed.data.role, admins)) {
      return res.status(409).json({message:'Impossible de retirer le rôle du dernier administrateur.'});
    }
  }
  try {
    const user = await prisma.user.update({
      where:{id},
      data:{
        ...(parsed.data.name !== undefined ? {name:parsed.data.name} : {}),
        ...(parsed.data.email !== undefined ? {email:parsed.data.email.toLowerCase()} : {}),
        ...(parsed.data.role !== undefined ? {role:parsed.data.role} : {}),
      },
    });
    res.json({data:{id:user.id,name:user.name,email:user.email,role:user.role}});
  } catch (e:any) {
    if (e?.code === 'P2002') return res.status(409).json({message:'Cet email existe déjà.'});
    throw e;
  }
});

usersRouter.delete('/:id', async (req,res) => {
  const id = routeId(req.params.id);
  if (!id) return res.status(400).json({message:'Identifiant utilisateur invalide.'});
  if (id === req.user!.id) return res.status(403).json({message:'Vous ne pouvez pas supprimer votre propre compte.'});
  const target = await prisma.user.findUnique({where:{id}});
  if (!target) return res.status(404).json({message:'Utilisateur introuvable.'});
  const admins = await prisma.user.count({where:{role:Role.admin}});
  if (wouldRemoveLastAdmin(target.role, null, admins)) {
    return res.status(409).json({message:'Impossible de supprimer le dernier administrateur.'});
  }
  await prisma.user.delete({where:{id}});
  res.status(204).end();
});

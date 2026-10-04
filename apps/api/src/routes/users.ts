import { Router } from 'express';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { allowRoles, requireAuth } from '../auth.js';
import { prisma } from '../db.js';

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

usersRouter.patch('/:id/role', async (req,res) => {
  const id = routeId(req.params.id);
  if (!id) return res.status(400).json({message:'Identifiant utilisateur invalide.'});
  const parsed = z.object({role:z.nativeEnum(Role)}).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({message:'Rôle invalide.'});
  if (id === req.user!.id && parsed.data.role !== Role.admin) {
    const admins = await prisma.user.count({where:{role:Role.admin}});
    if (admins <= 1) return res.status(409).json({message:'Impossible de retirer le rôle du dernier administrateur.'});
  }
  const user = await prisma.user.update({where:{id},data:{role:parsed.data.role}});
  res.json({data:{id:user.id,name:user.name,email:user.email,role:user.role}});
});

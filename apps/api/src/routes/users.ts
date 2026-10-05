import { Router } from 'express';
import { Role } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { allowRoles, requireAuth } from '../auth.js';
import { prisma } from '../db.js';
import { recordAudit } from '../audit.js';

export const usersRouter = Router();
usersRouter.use(requireAuth, allowRoles(Role.admin));
const routeId = (id: string | string[] | undefined) => Array.isArray(id) ? id[0] : id;

usersRouter.get('/', async (_req, res) => {
  const data = await prisma.user.findMany({ select:{id:true,name:true,email:true,role:true,isActive:true,lastLoginAt:true,createdAt:true}, orderBy:{name:'asc'} });
  res.json({data});
});

usersRouter.post('/', async (req, res) => {
  const parsed = z.object({name:z.string().trim().min(2).max(120),email:z.string().email(),password:z.string().min(8).max(100),role:z.nativeEnum(Role)}).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({message:'Données utilisateur invalides.',errors:parsed.error.flatten()});
  try {
    const user = await prisma.user.create({data:{name:parsed.data.name,email:parsed.data.email.toLowerCase(),passwordHash:await bcrypt.hash(parsed.data.password,12),role:parsed.data.role,mustChangePassword:true}});
    await recordAudit(req.user!, 'user_created', 'user', user.id, { role: user.role, email: user.email });
    res.status(201).json({data:{id:user.id,name:user.name,email:user.email,role:user.role,isActive:user.isActive,lastLoginAt:user.lastLoginAt}});
  } catch (e:any) {
    if (e?.code === 'P2002') return res.status(409).json({message:'Cet email existe déjà.'});
    throw e;
  }
});

const profileUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().max(190).optional(),
}).strict().refine(d => d.name !== undefined || d.email !== undefined, { message: 'Aucune modification fournie.' });

usersRouter.patch('/:id', async (req, res) => {
  const id = routeId(req.params.id);
  if (!id) return res.status(400).json({message:'Identifiant utilisateur invalide.'});
  const parsed = profileUpdateSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({message:'Données utilisateur invalides.',errors:parsed.error.flatten()});
  try {
    const user = await prisma.user.update({
      where:{id},
      data:{
        ...(parsed.data.name !== undefined ? {name:parsed.data.name} : {}),
        ...(parsed.data.email !== undefined ? {email:parsed.data.email.toLowerCase()} : {}),
      },
    });
    await recordAudit(req.user!, 'user_profile_updated', 'user', user.id, { name: user.name, email: user.email });
    res.json({data:{id:user.id,name:user.name,email:user.email,role:user.role,isActive:user.isActive,lastLoginAt:user.lastLoginAt}});
  } catch (e:any) {
    if (e?.code === 'P2002') return res.status(409).json({message:'Cet email existe déjà.'});
    if (e?.code === 'P2025') return res.status(404).json({message:'Utilisateur introuvable.'});
    throw e;
  }
});

usersRouter.patch('/:id/role', async (req,res) => {
  const id = routeId(req.params.id);
  if (!id) return res.status(400).json({message:'Identifiant utilisateur invalide.'});
  const parsed = z.object({role:z.nativeEnum(Role)}).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({message:'Rôle invalide.'});
  if (parsed.data.role !== Role.admin) {
    const target = await prisma.user.findUnique({where:{id},select:{role:true,isActive:true}});
    if (target?.role === Role.admin && target.isActive) {
      const activeAdmins = await prisma.user.count({where:{role:Role.admin,isActive:true}});
      if (activeAdmins <= 1) return res.status(409).json({message:'Impossible de retirer le rôle du dernier administrateur actif.'});
    }
  }
  const user = await prisma.user.update({where:{id},data:{role:parsed.data.role}});
  await recordAudit(req.user!, 'user_role_changed', 'user', user.id, { role: user.role });
  res.json({data:{id:user.id,name:user.name,email:user.email,role:user.role,isActive:user.isActive,lastLoginAt:user.lastLoginAt}});
});

usersRouter.patch('/:id/status', async (req, res) => {
  const id = routeId(req.params.id);
  if (!id) return res.status(400).json({message:'Identifiant utilisateur invalide.'});
  const parsed = z.object({isActive:z.boolean()}).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({message:'Statut utilisateur invalide.'});
  if (id === req.user!.id && !parsed.data.isActive) {
    return res.status(409).json({message:'Impossible de désactiver votre propre compte.'});
  }
  if (!parsed.data.isActive) {
    const target = await prisma.user.findUnique({where:{id},select:{role:true}});
    if (target?.role === Role.admin) {
      const activeAdmins = await prisma.user.count({where:{role:Role.admin,isActive:true}});
      if (activeAdmins <= 1) return res.status(409).json({message:'Impossible de désactiver le dernier administrateur actif.'});
    }
  }
  const user = await prisma.user.update({where:{id},data:{isActive:parsed.data.isActive}});
  await recordAudit(req.user!, parsed.data.isActive ? 'user_reactivated' : 'user_deactivated', 'user', user.id, { email: user.email });
  res.json({data:{id:user.id,name:user.name,email:user.email,role:user.role,isActive:user.isActive,lastLoginAt:user.lastLoginAt}});
});

usersRouter.patch('/:id/password', async (req, res) => {
  const id = routeId(req.params.id);
  if (!id) return res.status(400).json({message:'Identifiant utilisateur invalide.'});
  const parsed = z.object({password:z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères.').max(100)}).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({message:'Le mot de passe doit contenir au moins 8 caractères.',errors:parsed.error.flatten()});
  const user = await prisma.user.update({where:{id},data:{passwordHash:await bcrypt.hash(parsed.data.password,12),mustChangePassword:true}});
  await recordAudit(req.user!, 'password_reset_by_admin', 'user', user.id, { email: user.email });
  res.json({success:true});
});

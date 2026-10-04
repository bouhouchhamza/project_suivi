import './config.js';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import { prisma } from './db.js';
import { seedBusinessData } from './seed-data.js';

const email = (process.env.ADMIN_EMAIL ?? 'admin@suivi.local').toLowerCase();
const password = process.env.ADMIN_PASSWORD ?? 'ChangeMe123!';
const name = process.env.ADMIN_NAME ?? 'Administrateur';
const admin = await prisma.user.upsert({
  where:{email}, update:{},
  create:{email,name,role:Role.admin,passwordHash:await bcrypt.hash(password,12)}
});
if (await prisma.project.count() === 0 && process.env.AUTO_SEED_PROJECTS === 'true') await seedBusinessData(admin.id);
console.log(`Bootstrap OK. Admin: ${email}`);
await prisma.$disconnect();

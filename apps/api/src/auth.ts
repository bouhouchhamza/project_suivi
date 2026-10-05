import type { RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import type { Role } from '@prisma/client';
import { config } from './config.js';
import { prisma } from './db.js';

type TokenPayload = { id: string };
export const signToken = (user: { id: string }, rememberMe = false) =>
  jwt.sign({ id: user.id }, config.jwtSecret, { expiresIn: rememberMe ? '7d' : '12h' });
export function verifyToken(token: string) { return jwt.verify(token, config.jwtSecret) as TokenPayload; }

export const requireAuth: RequestHandler = async (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Authentification requise.' });
  try {
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.id }, select: { id:true,name:true,email:true,role:true,isActive:true,lastLoginAt:true,mustChangePassword:true } });
    if (!user) return res.status(401).json({ message: 'Compte introuvable.' });
    if (!user.isActive) return res.status(401).json({ message: 'Compte désactivé.' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ message: 'Session invalide ou expirée.' });
  }
};

export const allowRoles = (...roles: Role[]): RequestHandler => (req, res, next) => {
  if (!req.user) return res.status(401).json({ message: 'Authentification requise.' });
  if (!req.user.role || !roles.includes(req.user.role)) return res.status(403).json({ message: 'Accès non autorisé.' });
  next();
};

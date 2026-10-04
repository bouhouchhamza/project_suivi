import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db.js';
import { requireAuth, signToken } from '../auth.js';

export const authRouter = Router();
const loginFailures = new Map<string, { count: number; resetAt: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 10;
const LOGIN_FAILURE_CACHE_MAX = 1000;

function pruneLoginFailures(now = Date.now()) {
  for (const [key, failure] of loginFailures) {
    if (failure.resetAt <= now) loginFailures.delete(key);
  }
  while (loginFailures.size > LOGIN_FAILURE_CACHE_MAX) {
    const oldest = loginFailures.keys().next().value;
    if (!oldest) break;
    loginFailures.delete(oldest);
  }
}

function loginKey(email: string, ip: string | undefined) {
  return `${email.toLowerCase()}|${ip ?? 'unknown'}`;
}

function isLoginLimited(key: string) {
  const failure = loginFailures.get(key);
  if (!failure) return false;
  if (failure.resetAt <= Date.now()) {
    loginFailures.delete(key);
    return false;
  }
  return failure.count >= LOGIN_MAX_FAILURES;
}

function recordLoginFailure(key: string) {
  const now = Date.now();

  pruneLoginFailures(now);

  const current = loginFailures.get(key);

  if (!current || current.resetAt <= now) {
    loginFailures.set(key, {
      count: 1,
      resetAt: now + LOGIN_WINDOW_MS,
    });
  } else {
    current.count += 1;
  }

  pruneLoginFailures(now);
}

export const loginThrottleForTest = {
  key: loginKey,
  failures: loginFailures,
  isLimited: isLoginLimited,
  recordFailure: recordLoginFailure,
  prune: pruneLoginFailures,
  clear: () => loginFailures.clear(),
  maxEntries: LOGIN_FAILURE_CACHE_MAX,
};

authRouter.post('/login', async (req, res) => {
  const parsed = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ message: 'Email ou mot de passe invalide.' });
  const email = parsed.data.email.toLowerCase();
  const key = loginKey(email, req.ip);
  if (isLoginLimited(key)) return res.status(429).json({ message: 'Trop de tentatives. RÃƒÂ©essayez dans quelques minutes.' });
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await bcrypt.compare(parsed.data.password, user.passwordHash))) {
    recordLoginFailure(key);
    return res.status(401).json({ message: 'Email ou mot de passe incorrect.' });
  }
  loginFailures.delete(key);
  const safe = { id: user.id, name: user.name, email: user.email, role: user.role };
  res.json({ token: signToken(user), user: safe });
});

authRouter.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));


import type { Role } from '@prisma/client';

declare global {
  namespace Express {
    interface Request {
      user?: { id: string; name: string; email: string; role: Role | null; isActive?: boolean; lastLoginAt?: Date | null; mustChangePassword?: boolean };
    }
  }
}
export {};

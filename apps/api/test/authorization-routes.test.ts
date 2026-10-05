import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { Department, Priority, Role } from '@prisma/client';
import { app } from '../src/app.js';
import { signToken } from '../src/auth.js';
import { prisma } from '../src/db.js';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
type Patch = { target: Record<string, any>; key: string; value: any };

const patches: Patch[] = [];
let server: Server;
let baseUrl = '';
let state: Awaited<ReturnType<typeof createState>>;

const password = 'Current123!';
const projectUpdatedAt = new Date('2026-10-04T10:00:00.000Z');

async function createState() {
  const passwordHash = await bcrypt.hash(password, 4);
  return {
    users: new Map([
      ['admin', { id: 'admin', name: 'Admin', email: 'admin@example.test', role: Role.admin, isActive: true, lastLoginAt: null, passwordHash }],
      ['editor', { id: 'editor', name: 'Editor', email: 'editor@example.test', role: Role.editor, isActive: true, lastLoginAt: null, passwordHash }],
      ['viewer', { id: 'viewer', name: 'Viewer', email: 'viewer@example.test', role: Role.viewer, isActive: true, lastLoginAt: null, passwordHash }],
      ['inactive', { id: 'inactive', name: 'Inactive', email: 'inactive@example.test', role: Role.admin, isActive: false, lastLoginAt: null, passwordHash }],
    ]),
    projects: [
      {
        id: 'active-project',
        numero: 101,
        intitule: 'Projet actif',
        priorite: Priority.HAUTE,
        chef: 'Chef A',
        updatedBy: 'admin',
        archivedAt: null,
        archivedBy: null,
        createdAt: new Date('2026-10-01T00:00:00.000Z'),
        updatedAt: projectUpdatedAt,
        lignes: [{ departement: Department.STR, phase: null, delaiJours: null, dateLivrable: new Date('2026-10-03T00:00:00.000Z'), commentaire: null }],
      },
      {
        id: 'archived-project',
        numero: 102,
        intitule: 'Projet archive',
        priorite: Priority.BASSE,
        chef: 'Chef B',
        updatedBy: 'admin',
        archivedAt: new Date('2026-10-02T00:00:00.000Z'),
        archivedBy: 'admin',
        createdAt: new Date('2026-09-01T00:00:00.000Z'),
        updatedAt: new Date('2026-10-02T00:00:00.000Z'),
        lignes: [{ departement: Department.ECO, phase: null, delaiJours: null, dateLivrable: null, commentaire: null }],
      },
    ],
    savedViews: [
      { id: 'viewer-view', userId: 'viewer', name: 'Viewer view', filters: { priorities: [], chef: null, department: null, search: '', archived: false }, createdAt: new Date(), updatedAt: new Date() },
      { id: 'editor-view', userId: 'editor', name: 'Editor view', filters: { priorities: [], chef: null, department: null, search: '', archived: false }, createdAt: new Date(), updatedAt: new Date() },
    ],
    notifications: [
      { id: 'viewer-notification', userId: 'viewer', title: 'Notification', message: 'Message', type: 'info', projectId: 'active-project', dedupeKey: 'manual', readAt: null, createdAt: new Date() },
    ],
    auditLogs: [
      { id: 'audit-1', actorId: 'admin', actorName: 'Admin', actorEmail: 'admin@example.test', action: 'test', entityType: 'project', entityId: 'active-project', metadata: {}, createdAt: new Date() },
    ],
    companySettings: {
      id: 'default',
      clientName: 'Bureau Atlas',
      clientSlug: 'bureau-atlas',
      appDomain: 'atlas.example.test',
      supportEmail: 'support@example.test',
      companyLogo: null,
      primaryColor: '#123456',
      timezone: 'Africa/Casablanca',
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  };
}

function patch(target: Record<string, any>, key: string, value: any) {
  patches.push({ target, key, value: target[key] });
  target[key] = value;
}

function matchesWhere(row: any, where: Record<string, any> = {}) {
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected && typeof expected === 'object' && 'not' in expected) return actual !== expected.not;
    return actual === expected;
  });
}

function installPrismaMocks() {
  patch(prisma.user as any, 'findUnique', async ({ where }: any) => {
    if (where.id) return state.users.get(where.id) ?? null;
    if (where.email) return [...state.users.values()].find(user => user.email === where.email) ?? null;
    return null;
  });
  patch(prisma.user as any, 'findUniqueOrThrow', async ({ where }: any) => {
    const user = where.id ? state.users.get(where.id) : [...state.users.values()].find(candidate => candidate.email === where.email);
    if (!user) throw new Error('NOT_FOUND');
    return user;
  });
  patch(prisma.user as any, 'findMany', async () => [...state.users.values()]);
  patch(prisma.user as any, 'count', async ({ where = {} }: any = {}) => [...state.users.values()].filter(user => matchesWhere(user, where)).length);
  patch(prisma.user as any, 'create', async ({ data }: any) => {
    const user = { id: `user-${state.users.size + 1}`, ...data, isActive: true, lastLoginAt: null };
    state.users.set(user.id, user);
    return user;
  });
  patch(prisma.user as any, 'update', async ({ where, data }: any) => {
    const user = state.users.get(where.id);
    if (!user) throw new Error('NOT_FOUND');
    Object.assign(user, data);
    return user;
  });

  patch(prisma.project as any, 'findMany', async ({ where = {} }: any = {}) => state.projects.filter(project => matchesWhere(project, where)));
  patch(prisma.project as any, 'count', async ({ where = {} }: any = {}) => state.projects.filter(project => matchesWhere(project, where)).length);
  patch(prisma.project as any, 'findUnique', async ({ where }: any) => state.projects.find(project => project.id === where.id) ?? null);
  patch(prisma.project as any, 'findUniqueOrThrow', async ({ where }: any) => {
    const project = state.projects.find(candidate => candidate.id === where.id);
    if (!project) throw new Error('NOT_FOUND');
    return project;
  });
  patch(prisma.project as any, 'update', async ({ where, data }: any) => {
    const project = state.projects.find(candidate => candidate.id === where.id);
    if (!project) throw new Error('NOT_FOUND');
    Object.assign(project, data);
    return project;
  });
  patch(prisma.project as any, 'updateMany', async ({ where, data }: any) => {
    const targets = state.projects.filter(project => matchesWhere(project, where));
    targets.forEach(project => Object.assign(project, data));
    return { count: targets.length };
  });
  patch(prisma.project as any, 'delete', async ({ where }: any) => {
    const index = state.projects.findIndex(project => project.id === where.id);
    if (index < 0) throw new Error('NOT_FOUND');
    const [deleted] = state.projects.splice(index, 1);
    return deleted;
  });
  patch(prisma.projectLine as any, 'deleteMany', async () => ({ count: 0 }));
  patch(prisma.projectLine as any, 'createMany', async ({ data }: any) => ({ count: data.length }));
  patch(prisma.manager as any, 'upsert', async ({ create }: any) => create);
  patch(prisma.manager as any, 'findMany', async () => []);

  patch(prisma.auditLog as any, 'create', async ({ data }: any) => {
    const log = { id: `audit-${state.auditLogs.length + 1}`, ...data, createdAt: new Date() };
    state.auditLogs.push(log);
    return log;
  });
  patch(prisma.auditLog as any, 'findMany', async () => state.auditLogs);

  patch(prisma.notification as any, 'findMany', async ({ where = {} }: any = {}) => state.notifications.filter(notification => matchesWhere(notification, where)));
  patch(prisma.notification as any, 'upsert', async ({ where, create }: any) => {
    const dedupe = where.userId_dedupeKey;
    const existing = state.notifications.find(notification => notification.userId === dedupe.userId && notification.dedupeKey === dedupe.dedupeKey);
    if (existing) return existing;
    const notification = { id: `notification-${state.notifications.length + 1}`, readAt: null, createdAt: new Date(), ...create };
    state.notifications.push(notification);
    return notification;
  });
  patch(prisma.notification as any, 'updateMany', async ({ where, data }: any) => {
    const targets = state.notifications.filter(notification => matchesWhere(notification, where));
    targets.forEach(notification => Object.assign(notification, data));
    return { count: targets.length };
  });

  patch(prisma.savedView as any, 'findMany', async ({ where = {} }: any = {}) => state.savedViews.filter(view => matchesWhere(view, where)));
  patch(prisma.savedView as any, 'upsert', async ({ where, update, create }: any) => {
    const key = where.userId_name;
    const existing = state.savedViews.find(view => view.userId === key.userId && view.name === key.name);
    if (existing) {
      Object.assign(existing, update, { updatedAt: new Date() });
      return existing;
    }
    const view = { id: `view-${state.savedViews.length + 1}`, ...create, createdAt: new Date(), updatedAt: new Date() };
    state.savedViews.push(view);
    return view;
  });
  patch(prisma.savedView as any, 'updateMany', async ({ where, data }: any) => {
    const targets = state.savedViews.filter(view => matchesWhere(view, where));
    targets.forEach(view => Object.assign(view, data, { updatedAt: new Date() }));
    return { count: targets.length };
  });
  patch(prisma.savedView as any, 'findUniqueOrThrow', async ({ where }: any) => {
    const view = state.savedViews.find(candidate => candidate.id === where.id);
    if (!view) throw new Error('NOT_FOUND');
    return view;
  });
  patch(prisma.savedView as any, 'deleteMany', async ({ where }: any) => {
    const before = state.savedViews.length;
    state.savedViews = state.savedViews.filter(view => !matchesWhere(view, where));
    return { count: before - state.savedViews.length };
  });

  patch(prisma.companySettings as any, 'findUnique', async () => state.companySettings);
  patch(prisma.companySettings as any, 'upsert', async ({ update, create }: any) => {
    state.companySettings = { ...state.companySettings, ...create, ...update, updatedAt: new Date() };
    return state.companySettings;
  });

  patch(prisma as any, '$transaction', async (callback: any) => callback(prisma));
}

async function api(path: string, options: { method?: Method; user?: string; body?: any } = {}) {
  const headers: Record<string, string> = {};
  if (options.user) headers.Authorization = `Bearer ${signToken({ id: options.user })}`;
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;
  return { status: response.status, body };
}

async function expectStatus(path: string, status: number, options: { method?: Method; user?: string; body?: any } = {}) {
  const response = await api(path, options);
  assert.equal(response.status, status, `${options.method ?? 'GET'} ${path}`);
  return response.body;
}

before(async () => {
  state = await createState();
  installPrismaMocks();
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(async () => {
  state = await createState();
});

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  while (patches.length) {
    const { target, key, value } = patches.pop()!;
    target[key] = value;
  }
  await prisma.$disconnect();
});

test('protected B2B endpoints return 401 without authentication and inactive users are blocked', async () => {
  assert.equal((await api('/api/company/config')).status, 200);

  for (const path of [
    '/api/dashboard',
    '/api/audit-logs',
    '/api/notifications',
    '/api/saved-views',
    '/api/company/settings',
    '/api/users',
    '/api/projects',
    '/api/reports/management',
    '/api/admin/status',
  ]) {
    await expectStatus(path, 401);
    await expectStatus(path, 401, { user: 'inactive' });
  }

  await expectStatus('/api/auth/password', 401, { method: 'PATCH', body: { currentPassword: password, newPassword: 'NewPassword123!' } });
});

test('admin editor viewer matrix is enforced for read-oriented B2B routes', async () => {
  for (const role of ['admin', 'editor', 'viewer']) {
    await expectStatus('/api/dashboard', 200, { user: role });
    await expectStatus('/api/notifications', 200, { user: role });
    await expectStatus('/api/saved-views', 200, { user: role });
    await expectStatus('/api/projects', 200, { user: role });
    await expectStatus('/api/projects?archived=true', 200, { user: role });
    await expectStatus('/api/reports/management', 200, { user: role });
  }

  for (const path of ['/api/audit-logs', '/api/users', '/api/company/settings', '/api/admin/status']) {
    await expectStatus(path, 200, { user: 'admin' });
    await expectStatus(path, 403, { user: 'editor' });
    await expectStatus(path, 403, { user: 'viewer' });
  }
});

test('company settings update is admin-only', async () => {
  const body = {
    clientName: 'Bureau Atlas',
    clientSlug: 'bureau-atlas',
    appDomain: 'atlas.example.test',
    supportEmail: 'support@example.test',
    companyLogo: null,
    primaryColor: '#654321',
    timezone: 'Africa/Casablanca',
  };

  await expectStatus('/api/company/settings', 403, { method: 'PUT', user: 'editor', body });
  await expectStatus('/api/company/settings', 403, { method: 'PUT', user: 'viewer', body });
  const saved = await expectStatus('/api/company/settings', 200, { method: 'PUT', user: 'admin', body });
  assert.equal(saved.data.primaryColor, '#654321');
});

test('saved views are scoped to the owning user for read update and delete', async () => {
  const viewerViews = await expectStatus('/api/saved-views', 200, { user: 'viewer' });
  assert.deepEqual(viewerViews.data.map((view: any) => view.id), ['viewer-view']);

  await expectStatus('/api/saved-views/editor-view', 404, { method: 'PATCH', user: 'viewer', body: { name: 'stolen' } });
  await expectStatus('/api/saved-views/editor-view', 404, { method: 'DELETE', user: 'viewer' });

  const ownUpdate = await expectStatus('/api/saved-views/viewer-view', 200, { method: 'PATCH', user: 'viewer', body: { name: 'Mine' } });
  assert.equal(ownUpdate.data.name, 'Mine');
  await expectStatus('/api/saved-views/viewer-view', 204, { method: 'DELETE', user: 'viewer' });
});

test('user lifecycle endpoints are admin-only and protect forbidden self operations', async () => {
  await expectStatus('/api/users/editor/status', 403, { method: 'PATCH', user: 'editor', body: { isActive: false } });
  await expectStatus('/api/users/viewer/password', 403, { method: 'PATCH', user: 'viewer', body: { password: 'Reset123!' } });

  const status = await expectStatus('/api/users/editor/status', 200, { method: 'PATCH', user: 'admin', body: { isActive: false } });
  assert.equal(status.data.isActive, false);

  const role = await expectStatus('/api/users/editor/role', 200, { method: 'PATCH', user: 'admin', body: { role: Role.viewer } });
  assert.equal(role.data.role, Role.viewer);

  await expectStatus('/api/users/viewer/password', 200, { method: 'PATCH', user: 'admin', body: { password: 'Reset123!' } });
  await expectStatus('/api/users/admin/status', 409, { method: 'PATCH', user: 'admin', body: { isActive: false } });
  await expectStatus('/api/users/admin/role', 409, { method: 'PATCH', user: 'admin', body: { role: Role.viewer } });
});

test('project archive restore and permanent delete permissions match current product rules', async () => {
  await expectStatus('/api/projects/active-project', 403, {
    method: 'DELETE',
    user: 'viewer',
    body: { baseUpdatedAt: projectUpdatedAt.toISOString(), force: true },
  });

  await expectStatus('/api/projects/active-project', 204, {
    method: 'DELETE',
    user: 'editor',
    body: { baseUpdatedAt: projectUpdatedAt.toISOString(), force: true },
  });

  assert.ok(state.projects.find(project => project.id === 'active-project')?.archivedAt);

  await expectStatus('/api/projects/archived-project/restore', 403, { method: 'POST', user: 'editor' });
  await expectStatus('/api/projects/archived-project/restore', 403, { method: 'POST', user: 'viewer' });
  await expectStatus('/api/projects/archived-project/restore', 200, { method: 'POST', user: 'admin' });

  state.projects.find(project => project.id === 'archived-project')!.archivedAt = new Date('2026-10-02T00:00:00.000Z');
  await expectStatus('/api/projects/archived-project/permanent', 403, { method: 'DELETE', user: 'editor', body: { confirmation: 'SUPPRIMER DEFINITIVEMENT' } });
  await expectStatus('/api/projects/archived-project/permanent', 403, { method: 'DELETE', user: 'viewer', body: { confirmation: 'SUPPRIMER DEFINITIVEMENT' } });
  await expectStatus('/api/projects/archived-project/permanent', 204, { method: 'DELETE', user: 'admin', body: { confirmation: 'SUPPRIMER DEFINITIVEMENT' } });
});

test('current user password change is available to authenticated active users only', async () => {
  await expectStatus('/api/auth/password', 401, {
    method: 'PATCH',
    user: 'viewer',
    body: { currentPassword: 'WrongPassword', newPassword: 'NewPassword123!' },
  });

  await expectStatus('/api/auth/password', 200, {
    method: 'PATCH',
    user: 'viewer',
    body: { currentPassword: password, newPassword: 'NewPassword123!' },
  });
});

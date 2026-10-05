import test, { after, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import bcrypt from 'bcryptjs';
import { Priority, Role } from '@prisma/client';
import { app } from '../src/app.js';
import { signToken } from '../src/auth.js';
import { prisma } from '../src/db.js';

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE' | 'PUT';
type Patch = { target: Record<string, any>; key: string; value: any };

const patches: Patch[] = [];
let server: Server;
let baseUrl = '';
let seq = 0;
const uniq = () => `t${Date.now()}-${seq++}`;

let users: Map<string, any>;
let projects: any[];
let excelTemplate: any | null;
let auditLogs: any[];

function patch(target: Record<string, any>, key: string, value: any) {
  patches.push({ target, key, value: target[key] });
  target[key] = value;
}

function matchesWhere(row: any, where: Record<string, any> = {}) {
  return Object.entries(where).every(([key, expected]) => {
    if (expected === undefined) return true;
    const actual = row[key];
    if (expected instanceof Date) return actual instanceof Date && actual.getTime() === expected.getTime();
    if (expected && typeof expected === 'object' && 'not' in expected) {
      return actual !== expected.not;
    }
    return actual === expected;
  });
}

function resetState() {
  users = new Map();
  projects = [];
  excelTemplate = null;
  auditLogs = [];
}

async function makeUser(role: Role, overrides: Partial<any> = {}) {
  const id = `user-${uniq()}`;
  const user = {
    id,
    name: overrides.name ?? `User ${id}`,
    email: overrides.email ?? `${id}@test.local`,
    passwordHash: overrides.passwordHash ?? await bcrypt.hash('Current123!', 4),
    role,
    isActive: overrides.isActive ?? true,
    lastLoginAt: null,
    mustChangePassword: overrides.mustChangePassword ?? false,
  };
  users.set(id, user);
  return { user, auth: { Authorization: `Bearer ${signToken({ id })}` } };
}

function project(row: any, select?: Record<string, boolean>) {
  if (!select) return row;
  return Object.fromEntries(Object.entries(row).filter(([key]) => select[key]));
}

function installMocks() {
  patch(prisma.user as any, 'findUnique', async ({ where, select }: any) => {
    const found = where.id ? users.get(where.id) : where.email ? [...users.values()].find(u => u.email === where.email) : null;
    return found ? project(found, select) : null;
  });
  patch(prisma.user as any, 'findUniqueOrThrow', async ({ where }: any) => {
    const user = where.id ? users.get(where.id) : [...users.values()].find(u => u.email === where.email);
    if (!user) throw new Error('NOT_FOUND');
    return user;
  });
  patch(prisma.user as any, 'findMany', async () => [...users.values()]);
  patch(prisma.user as any, 'count', async ({ where = {} }: any = {}) => [...users.values()].filter(u => matchesWhere(u, where)).length);
  patch(prisma.user as any, 'create', async ({ data }: any) => {
    const id = `user-${uniq()}`;
    const user = { id, isActive: true, lastLoginAt: null, mustChangePassword: false, ...data };
    users.set(id, user);
    return user;
  });
  patch(prisma.user as any, 'update', async ({ where, data }: any) => {
    const user = users.get(where.id);
    if (!user) { const e: any = new Error('NOT_FOUND'); e.code = 'P2025'; throw e; }
    if (data.email !== undefined && [...users.values()].some(u => u.id !== user.id && u.email === data.email)) {
      const e: any = new Error('UNIQUE'); e.code = 'P2002'; throw e;
    }
    Object.assign(user, data);
    return user;
  });

  patch(prisma.project as any, 'findMany', async ({ where = {} }: any = {}) => projects.filter(p => matchesWhere(p, where)));
  patch(prisma.project as any, 'findUnique', async ({ where }: any) => projects.find(p => p.id === where.id) ?? null);
  patch(prisma.project as any, 'findUniqueOrThrow', async ({ where }: any) => {
    const p = projects.find(x => x.id === where.id);
    if (!p) throw new Error('NOT_FOUND');
    return p;
  });
  patch(prisma.project as any, 'aggregate', async ({ where = {}, _max }: any) => {
    const matching = projects.filter(p => matchesWhere(p, where));
    if (_max?.priorityOrder) {
      const values = matching.map(p => p.priorityOrder ?? 0);
      return { _max: { priorityOrder: values.length ? Math.max(...values) : null } };
    }
    return { _max: {} };
  });
  patch(prisma.project as any, 'create', async ({ data }: any) => {
    const id = `project-${uniq()}`;
    const { lignes, ...rest } = data;
    const project = {
      id, archivedAt: null, archivedBy: null, createdAt: new Date(), updatedAt: new Date(),
      lignes: (lignes?.create ?? []).map((l: any, i: number) => ({ id: `line-${id}-${i}`, ...l })),
      ...rest,
    };
    projects.push(project);
    return project;
  });
  patch(prisma.project as any, 'update', async ({ where, data }: any) => {
    const p = projects.find(x => x.id === where.id);
    if (!p) { const e: any = new Error('NOT_FOUND'); e.code = 'P2025'; throw e; }
    Object.assign(p, data, { updatedAt: data.updatedAt ?? new Date() });
    return p;
  });
  patch(prisma.project as any, 'updateMany', async ({ where, data }: any) => {
    const targets = projects.filter(p => matchesWhere(p, where));
    targets.forEach(p => Object.assign(p, data));
    return { count: targets.length };
  });
  patch(prisma.project as any, 'delete', async ({ where }: any) => {
    const idx = projects.findIndex(p => p.id === where.id);
    if (idx < 0) throw new Error('NOT_FOUND');
    const [removed] = projects.splice(idx, 1);
    return removed;
  });

  patch(prisma.projectLine as any, 'deleteMany', async ({ where }: any) => {
    const p = projects.find(x => x.id === where.projectId);
    if (p) p.lignes = [];
    return { count: 0 };
  });
  patch(prisma.projectLine as any, 'createMany', async ({ data }: any) => {
    if (!data.length) return { count: 0 };
    const p = projects.find(x => x.id === data[0].projectId);
    if (p) p.lignes = data.map((l: any, i: number) => ({ id: `line-${p.id}-${i}`, ...l }));
    return { count: data.length };
  });

  patch(prisma.manager as any, 'upsert', async ({ create }: any) => create);

  patch(prisma.excelTemplate as any, 'findUnique', async () => excelTemplate);
  patch(prisma.excelTemplate as any, 'upsert', async ({ update, create }: any) => {
    excelTemplate = excelTemplate ? { ...excelTemplate, ...update } : { ...create };
    return excelTemplate;
  });

  patch(prisma.auditLog as any, 'create', async ({ data }: any) => {
    const log = { id: `audit-${uniq()}`, createdAt: new Date(), ...data };
    auditLogs.push(log);
    return log;
  });

  patch(prisma as any, '$transaction', async (callback: any) => (typeof callback === 'function' ? callback(prisma) : Promise.all(callback)));
}

async function api(path: string, options: { method?: Method; headers?: Record<string, string>; body?: any } = {}) {
  const headers: Record<string, string> = { ...(options.headers ?? {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method ?? 'GET',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

function emptyLignes() {
  return ['STR', 'ECO', 'FLU', 'ELEC', 'VRD', 'BIM'].map(departement => ({ departement, phase: null, delaiJours: null, dateLivrable: null, commentaire: null }));
}

async function createProject(auth: Record<string, string>, numero: number, priorite: Priority | null) {
  const r = await api('/api/projects', { method: 'POST', headers: auth, body: { numero, intitule: `Projet ${numero}`, priorite, chef: null, lignes: emptyLignes() } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.data;
}

before(async () => {
  installMocks();
  server = app.listen(0);
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

beforeEach(() => { resetState(); });

after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  while (patches.length) { const { target, key, value } = patches.pop()!; target[key] = value; }
  await prisma.$disconnect();
});

// ---------- PROJECT PRIORITY ORDERING ----------

test('listing groups HAUTE before MOYENNE before BASSE before no-priority', async () => {
  const { auth } = await makeUser(Role.editor);
  await createProject(auth, 1, Priority.BASSE);
  await createProject(auth, 2, Priority.HAUTE);
  await createProject(auth, 3, Priority.MOYENNE);
  await createProject(auth, 4, null);
  const r = await api('/api/projects', { headers: auth });
  assert.deepEqual(r.data.data.map((p: any) => p.priorite), [Priority.HAUTE, Priority.MOYENNE, Priority.BASSE, null]);
});

test('a newly created project is appended to the end of its priority group', async () => {
  const { auth } = await makeUser(Role.editor);
  const p1 = await createProject(auth, 1, Priority.HAUTE);
  const p2 = await createProject(auth, 2, Priority.HAUTE);
  const r = await api('/api/projects', { headers: auth });
  assert.deepEqual(r.data.data.map((p: any) => p.id), [p1.id, p2.id]);
});

test('changing priority moves the project to the end of the destination group', async () => {
  const { auth } = await makeUser(Role.editor);
  const p1 = await createProject(auth, 1, Priority.HAUTE);
  const p2 = await createProject(auth, 2, Priority.HAUTE);
  const p3 = await createProject(auth, 3, Priority.MOYENNE);

  const putRes = await api(`/api/projects/${p1.id}`, {
    method: 'PUT', headers: auth,
    body: { baseUpdatedAt: p1.updatedAt, project: { numero: p1.numero, intitule: p1.intitule, priorite: Priority.MOYENNE, chef: null, lignes: p1.lignes } },
  });
  assert.equal(putRes.status, 200, JSON.stringify(putRes.data));

  const r = await api('/api/projects', { headers: auth });
  const hauteIds = r.data.data.filter((p: any) => p.priorite === Priority.HAUTE).map((p: any) => p.id);
  assert.deepEqual(hauteIds.filter((id: string) => [p1.id, p2.id].includes(id)), [p2.id]);
  const moyenneIds = r.data.data.filter((p: any) => p.priorite === Priority.MOYENNE).map((p: any) => p.id);
  assert.deepEqual(moyenneIds.filter((id: string) => [p1.id, p3.id].includes(id)), [p3.id, p1.id]);
});

test('editing a project without changing priority preserves its position', async () => {
  const { auth } = await makeUser(Role.editor);
  const p1 = await createProject(auth, 1, Priority.HAUTE);
  const p2 = await createProject(auth, 2, Priority.HAUTE);

  const putRes = await api(`/api/projects/${p1.id}`, {
    method: 'PUT', headers: auth,
    body: { baseUpdatedAt: p1.updatedAt, project: { numero: p1.numero, intitule: 'Titre modifie', priorite: Priority.HAUTE, chef: null, lignes: p1.lignes } },
  });
  assert.equal(putRes.status, 200, JSON.stringify(putRes.data));

  const r = await api('/api/projects', { headers: auth });
  assert.deepEqual(r.data.data.map((p: any) => p.id), [p1.id, p2.id]);
});

test('merge import keeps position when priority is unchanged and appends when a project is new', async () => {
  const { auth } = await makeUser(Role.editor);
  const p1 = await createProject(auth, 101, Priority.HAUTE);
  const p2 = await createProject(auth, 102, Priority.HAUTE);

  const r = await api('/api/projects/import/bulk', {
    method: 'POST', headers: auth,
    body: {
      mode: 'merge', managers: [],
      projects: [
        { numero: 101, intitule: p1.intitule, priorite: Priority.HAUTE, chef: null, lignes: emptyLignes() },
        { numero: 999, intitule: 'Nouveau projet importe', priorite: Priority.HAUTE, chef: null, lignes: emptyLignes() },
      ],
    },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));

  const listed = await api('/api/projects', { headers: auth });
  const hauteNumeros = listed.data.data.filter((p: any) => p.priorite === Priority.HAUTE).map((p: any) => p.numero);
  assert.deepEqual(hauteNumeros, [101, 102, 999]);
  void p2;
});

test('merge import repositions a project to the end of its destination group when priority changes', async () => {
  const { auth } = await makeUser(Role.editor);
  const p1 = await createProject(auth, 1, Priority.HAUTE);
  const p2 = await createProject(auth, 2, Priority.MOYENNE);

  const r = await api('/api/projects/import/bulk', {
    method: 'POST', headers: auth,
    body: { mode: 'merge', managers: [], projects: [{ numero: 1, intitule: p1.intitule, priorite: Priority.MOYENNE, chef: null, lignes: emptyLignes() }] },
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));

  const listed = await api('/api/projects', { headers: auth });
  const moyenneIds = listed.data.data.filter((p: any) => p.priorite === Priority.MOYENNE).map((p: any) => p.id);
  assert.deepEqual(moyenneIds, [p2.id, p1.id]);
});

test('archived projects do not break active ordering, and restore is coherent', async () => {
  const { auth } = await makeUser(Role.admin);
  const p1 = await createProject(auth, 1, Priority.HAUTE);
  const p2 = await createProject(auth, 2, Priority.HAUTE);
  const p3 = await createProject(auth, 3, Priority.HAUTE);

  const del = await api(`/api/projects/${p2.id}`, { method: 'DELETE', headers: auth, body: { baseUpdatedAt: p2.updatedAt, force: true } });
  assert.equal(del.status, 204);

  const active = await api('/api/projects', { headers: auth });
  const activeIds = active.data.data.filter((p: any) => [p1.id, p2.id, p3.id].includes(p.id)).map((p: any) => p.id);
  assert.deepEqual(activeIds, [p1.id, p3.id]);

  const restore = await api(`/api/projects/${p2.id}/restore`, { method: 'POST', headers: auth });
  assert.equal(restore.status, 200);

  const after = await api('/api/projects', { headers: auth });
  const afterIds = after.data.data.filter((p: any) => [p1.id, p2.id, p3.id].includes(p.id)).map((p: any) => p.id);
  assert.deepEqual(afterIds, [p1.id, p2.id, p3.id]);
});

// ---------- EXCEL TEMPLATE ----------

test('no template registered returns 404', async () => {
  const { auth } = await makeUser(Role.viewer);
  const r = await api('/api/excel-template', { headers: auth });
  assert.equal(r.status, 404);
});

test('viewer cannot upload a template but can download one', async () => {
  const { auth: editorAuth } = await makeUser(Role.editor);
  const { auth: viewerAuth } = await makeUser(Role.viewer);
  const bytes = Buffer.from('fake-xlsx-content');

  const forbidden = await fetch(`${baseUrl}/api/excel-template`, {
    method: 'PUT',
    headers: { ...viewerAuth, 'Content-Type': 'application/octet-stream', 'X-Template-Filename': encodeURIComponent('import.xlsx') },
    body: bytes,
  });
  assert.equal(forbidden.status, 403);

  const uploaded = await fetch(`${baseUrl}/api/excel-template`, {
    method: 'PUT',
    headers: { ...editorAuth, 'Content-Type': 'application/octet-stream', 'X-Template-Filename': encodeURIComponent('Suivi Final.xlsx') },
    body: bytes,
  });
  assert.equal(uploaded.status, 204);

  const downloaded = await api('/api/excel-template', { headers: viewerAuth });
  assert.equal(downloaded.status, 200);
});

test('admin can upload a template, and the filename survives a round trip', async () => {
  const { auth } = await makeUser(Role.admin);
  const put = await fetch(`${baseUrl}/api/excel-template`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/octet-stream', 'X-Template-Filename': encodeURIComponent('Suivi Été.xlsx') },
    body: Buffer.from('content-a'),
  });
  assert.equal(put.status, 204);
  const get = await fetch(`${baseUrl}/api/excel-template`, { headers: auth });
  assert.equal(get.status, 200);
  assert.equal(decodeURIComponent(get.headers.get('x-template-filename') ?? ''), 'Suivi Été.xlsx');
  assert.equal(await get.text(), 'content-a');
});

test('uploading a new template replaces the previous one', async () => {
  const { auth } = await makeUser(Role.admin);
  await fetch(`${baseUrl}/api/excel-template`, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/octet-stream', 'X-Template-Filename': encodeURIComponent('first.xlsx') }, body: Buffer.from('first') });
  await fetch(`${baseUrl}/api/excel-template`, { method: 'PUT', headers: { ...auth, 'Content-Type': 'application/octet-stream', 'X-Template-Filename': encodeURIComponent('second.xlsx') }, body: Buffer.from('second') });
  const get = await fetch(`${baseUrl}/api/excel-template`, { headers: auth });
  assert.equal(decodeURIComponent(get.headers.get('x-template-filename') ?? ''), 'second.xlsx');
  assert.equal(await get.text(), 'second');
});

// ---------- USERS: NAME/EMAIL EDIT ----------

test('admin can edit a user name and email', async () => {
  const { auth } = await makeUser(Role.admin);
  const { user: target } = await makeUser(Role.viewer);
  const newEmail = `edited.${uniq()}@test.local`;
  const r = await api(`/api/users/${target.id}`, { method: 'PATCH', headers: auth, body: { name: 'Nouveau Nom', email: newEmail } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.data.name, 'Nouveau Nom');
  assert.equal(r.data.data.email, newEmail.toLowerCase());
});

test('duplicate email is rejected on update', async () => {
  const { auth } = await makeUser(Role.admin);
  const { user: userA } = await makeUser(Role.viewer);
  const { user: userB } = await makeUser(Role.viewer);
  const r = await api(`/api/users/${userB.id}`, { method: 'PATCH', headers: auth, body: { email: userA.email.toUpperCase() } });
  assert.equal(r.status, 409);
});

test('non-admin is rejected from the profile-edit endpoint', async () => {
  const { auth } = await makeUser(Role.editor);
  const { user: target } = await makeUser(Role.viewer);
  const r = await api(`/api/users/${target.id}`, { method: 'PATCH', headers: auth, body: { name: 'Hack' } });
  assert.equal(r.status, 403);
});

test('the role endpoint still works independently of the profile-edit endpoint', async () => {
  const { auth } = await makeUser(Role.admin);
  const { user: target } = await makeUser(Role.viewer);
  const r = await api(`/api/users/${target.id}/role`, { method: 'PATCH', headers: auth, body: { role: Role.editor } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.data.role, Role.editor);
});

test('deactivate and reactivate still work', async () => {
  const { auth } = await makeUser(Role.admin);
  const { user: target } = await makeUser(Role.viewer);
  const off = await api(`/api/users/${target.id}/status`, { method: 'PATCH', headers: auth, body: { isActive: false } });
  assert.equal(off.status, 200);
  assert.equal(off.data.data.isActive, false);
  const on = await api(`/api/users/${target.id}/status`, { method: 'PATCH', headers: auth, body: { isActive: true } });
  assert.equal(on.status, 200);
  assert.equal(on.data.data.isActive, true);
});

test('active last-admin protection only counts active admins, not deactivated ones', async () => {
  const { auth, user: admin } = await makeUser(Role.admin);
  await makeUser(Role.admin, { isActive: false });

  const demote = await api(`/api/users/${admin.id}/role`, { method: 'PATCH', headers: auth, body: { role: Role.viewer } });
  assert.equal(demote.status, 409, JSON.stringify(demote.data));

  const deactivateSelf = await api(`/api/users/${admin.id}/status`, { method: 'PATCH', headers: auth, body: { isActive: false } });
  assert.equal(deactivateSelf.status, 409);
});

// ---------- PASSWORD LIFECYCLE ----------

test('admin-created user gets mustChangePassword=true and a hashed, never-returned password', async () => {
  const { auth } = await makeUser(Role.admin);
  const email = `new.${uniq()}@test.local`;
  const r = await api('/api/users', { method: 'POST', headers: auth, body: { name: 'Nouvel Utilisateur', email, password: 'Temporary123!', role: Role.viewer } });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const stored = [...users.values()].find(u => u.email === email.toLowerCase())!;
  assert.equal(stored.mustChangePassword, true);
  assert.notEqual(stored.passwordHash, 'Temporary123!');
  assert.equal('passwordHash' in r.data.data, false);
});

test('admin password reset sets mustChangePassword=true', async () => {
  const { auth } = await makeUser(Role.admin);
  const { user: target } = await makeUser(Role.viewer, { mustChangePassword: false });
  const r = await api(`/api/users/${target.id}/password`, { method: 'PATCH', headers: auth, body: { password: 'NewTemp123!' } });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(users.get(target.id)!.mustChangePassword, true);
});

test('self password change requires the current password and clears mustChangePassword', async () => {
  const { auth, user } = await makeUser(Role.viewer, { mustChangePassword: true });

  const wrong = await api('/api/auth/password', { method: 'PATCH', headers: auth, body: { currentPassword: 'WrongPassword', newPassword: 'NewPassword123!' } });
  assert.equal(wrong.status, 401);
  assert.equal(users.get(user.id)!.mustChangePassword, true);

  const ok = await api('/api/auth/password', { method: 'PATCH', headers: auth, body: { currentPassword: 'Current123!', newPassword: 'NewPassword123!' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(users.get(user.id)!.mustChangePassword, false);
});

test('/auth/me exposes mustChangePassword and never exposes the password hash', async () => {
  const { auth } = await makeUser(Role.viewer, { mustChangePassword: true });
  const r = await api('/api/auth/me', { headers: auth });
  assert.equal(r.status, 200);
  assert.equal(r.data.user.mustChangePassword, true);
  assert.equal('passwordHash' in r.data.user, false);
});

test('an inactive user is blocked from protected routes regardless of password state', async () => {
  const { auth } = await makeUser(Role.viewer, { isActive: false, mustChangePassword: true });
  const r = await api('/api/auth/me', { headers: auth });
  assert.equal(r.status, 401);
});

test('audit records for password actions never contain password material', async () => {
  const { auth } = await makeUser(Role.admin);
  const { user: target } = await makeUser(Role.viewer);
  await api(`/api/users/${target.id}/password`, { method: 'PATCH', headers: auth, body: { password: 'ResetTemp123!' } });
  const relevant = auditLogs.filter(l => l.action === 'password_reset_by_admin');
  assert.equal(relevant.length, 1);
  const serialized = JSON.stringify(relevant[0]);
  assert.equal(serialized.includes('ResetTemp123!'), false);
  assert.equal(/passwordHash/i.test(serialized), false);
});

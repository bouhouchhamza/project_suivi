import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AddressInfo } from 'node:net';
import { Priority, Role } from '@prisma/client';
import { prisma } from '../src/db.js';
import { app } from '../src/app.js';
import { signToken } from '../src/auth.js';
import { DEPARTMENTS } from '../src/domain.js';

let server: http.Server;
let baseUrl: string;
let seq = 0;
const uniq = () => `${Date.now()}-${process.pid}-${seq++}-${Math.random().toString(36).slice(2)}`;

async function call(path: string, init: RequestInit = {}) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers ?? {}) },
  });
  const text = await res.text();
  let data: any;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}

async function makeUser(role: Role) {
  const user = await prisma.user.create({
    data: { name: `User ${uniq()}`, email: `user.${uniq()}@test.local`, passwordHash: 'x', role },
  });
  return { user, token: signToken({ id: user.id }), auth: { Authorization: `Bearer ${signToken({ id: user.id })}` } };
}

function emptyLignes() {
  return DEPARTMENTS.map(departement => ({ departement, phase: null, delaiJours: null, dateLivrable: null, commentaire: null }));
}

async function createProject(auth: Record<string, string>, numero: number, priorite: Priority | null) {
  const r = await call('/api/projects', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ numero, intitule: `Projet ${numero}`, priorite, chef: null, lignes: emptyLignes() }),
  });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  return r.data.data;
}

test.before(async () => {
  server = http.createServer(app);
  await new Promise<void>(resolve => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

test.after(async () => {
  await new Promise<void>(resolve => server.close(() => resolve()));
  await prisma.$disconnect();
});

// ---------- USERS ----------

test('admin can edit a user name and email', async () => {
  const { auth } = await makeUser(Role.admin);
  const { user: target } = await makeUser(Role.viewer);
  const newEmail = `edited.${uniq()}@test.local`;
  const r = await call(`/api/users/${target.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ name: 'Nouveau Nom', email: newEmail }) });
  assert.equal(r.status, 200);
  assert.equal(r.data.data.name, 'Nouveau Nom');
  assert.equal(r.data.data.email, newEmail.toLowerCase());
});

test('duplicate email is rejected on update', async () => {
  const { auth } = await makeUser(Role.admin);
  const { user: userA } = await makeUser(Role.viewer);
  const { user: userB } = await makeUser(Role.viewer);
  const r = await call(`/api/users/${userB.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ email: userA.email.toUpperCase() }) });
  assert.equal(r.status, 409);
});

test('non-admin is rejected from user management endpoints', async () => {
  const { auth } = await makeUser(Role.editor);
  const { user: target } = await makeUser(Role.viewer);
  const r = await call(`/api/users/${target.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ name: 'Hack' }) });
  assert.equal(r.status, 403);
});

test('admin cannot delete their own account', async () => {
  const { user: admin, auth } = await makeUser(Role.admin);
  const r = await call(`/api/users/${admin.id}`, { method: 'DELETE', headers: auth });
  assert.equal(r.status, 403);
  assert.equal(await prisma.user.count({ where: { id: admin.id } }), 1);
});

test('sole admin cannot demote themselves (last admin protection)', async () => {
  const { user: admin, auth } = await makeUser(Role.admin);
  await prisma.user.updateMany({ where: { role: Role.admin, id: { not: admin.id } }, data: { role: Role.viewer } });
  const remainingAdmins = await prisma.user.count({ where: { role: Role.admin } });
  assert.equal(remainingAdmins, 1);
  const r = await call(`/api/users/${admin.id}`, { method: 'PATCH', headers: auth, body: JSON.stringify({ role: 'viewer' }) });
  assert.equal(r.status, 409);
});

test('admin can delete another admin when more than one remains', async () => {
  const { auth } = await makeUser(Role.admin);
  const { user: otherAdmin } = await makeUser(Role.admin);
  const r = await call(`/api/users/${otherAdmin.id}`, { method: 'DELETE', headers: auth });
  assert.equal(r.status, 204);
});

test('admin can delete a normal (non-admin) user', async () => {
  const { auth } = await makeUser(Role.admin);
  const { user: viewer } = await makeUser(Role.viewer);
  const r = await call(`/api/users/${viewer.id}`, { method: 'DELETE', headers: auth });
  assert.equal(r.status, 204);
  assert.equal(await prisma.user.count({ where: { id: viewer.id } }), 0);
});

// ---------- PROJECT ORDERING ----------

test('listing groups HAUTE before MOYENNE before BASSE', async () => {
  const { auth } = await makeUser(Role.editor);
  const base = 900000 + (seq++ * 10);
  const pBasse = await createProject(auth, base + 1, Priority.BASSE);
  const pHaute = await createProject(auth, base + 2, Priority.HAUTE);
  const pMoyenne = await createProject(auth, base + 3, Priority.MOYENNE);
  const r = await call('/api/projects', { headers: auth });
  const ids = new Set([pBasse.id, pHaute.id, pMoyenne.id]);
  const order = r.data.data.filter((p: any) => ids.has(p.id)).map((p: any) => p.priorite);
  assert.deepEqual(order, [Priority.HAUTE, Priority.MOYENNE, Priority.BASSE]);
});

test('a newly created project is appended to the end of its priority group', async () => {
  const { auth } = await makeUser(Role.editor);
  const base = 901000 + (seq++ * 10);
  const p1 = await createProject(auth, base + 1, Priority.HAUTE);
  const p2 = await createProject(auth, base + 2, Priority.HAUTE);
  const r = await call('/api/projects', { headers: auth });
  const ids = new Set([p1.id, p2.id]);
  const order = r.data.data.filter((p: any) => ids.has(p.id)).map((p: any) => p.id);
  assert.deepEqual(order, [p1.id, p2.id]);
});

test('changing priority moves the project to the end of the destination group', async () => {
  const { auth } = await makeUser(Role.editor);
  const base = 902000 + (seq++ * 10);
  const p1 = await createProject(auth, base + 1, Priority.HAUTE);
  const p2 = await createProject(auth, base + 2, Priority.HAUTE);
  const p3 = await createProject(auth, base + 3, Priority.MOYENNE);

  const putBody = { numero: p1.numero, intitule: p1.intitule, priorite: Priority.MOYENNE, chef: null, lignes: p1.lignes };
  const putRes = await call(`/api/projects/${p1.id}`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({ baseUpdatedAt: p1.updatedAt, project: putBody }),
  });
  assert.equal(putRes.status, 200, JSON.stringify(putRes.data));

  const r = await call('/api/projects', { headers: auth });
  const hauteIds = new Set([p1.id, p2.id]);
  const hauteOrder = r.data.data.filter((p: any) => hauteIds.has(p.id) && p.priorite === Priority.HAUTE).map((p: any) => p.id);
  assert.deepEqual(hauteOrder, [p2.id]);

  const moyenneIds = new Set([p1.id, p3.id]);
  const moyenneOrder = r.data.data.filter((p: any) => moyenneIds.has(p.id) && p.priorite === Priority.MOYENNE).map((p: any) => p.id);
  assert.deepEqual(moyenneOrder, [p3.id, p1.id]);
});

test('editing a project without changing priority preserves its position', async () => {
  const { auth } = await makeUser(Role.editor);
  const base = 903000 + (seq++ * 10);
  const p1 = await createProject(auth, base + 1, Priority.HAUTE);
  const p2 = await createProject(auth, base + 2, Priority.HAUTE);

  const putBody = { numero: p1.numero, intitule: 'Titre modifié', priorite: Priority.HAUTE, chef: null, lignes: p1.lignes };
  const putRes = await call(`/api/projects/${p1.id}`, {
    method: 'PUT', headers: auth,
    body: JSON.stringify({ baseUpdatedAt: p1.updatedAt, project: putBody }),
  });
  assert.equal(putRes.status, 200, JSON.stringify(putRes.data));

  const r = await call('/api/projects', { headers: auth });
  const ids = new Set([p1.id, p2.id]);
  const order = r.data.data.filter((p: any) => ids.has(p.id)).map((p: any) => p.id);
  assert.deepEqual(order, [p1.id, p2.id]);
});

// ---------- EXCEL TEMPLATE ----------

test('no template registered returns 404', async () => {
  const { auth } = await makeUser(Role.viewer);
  await prisma.excelTemplate.deleteMany();
  const r = await call('/api/excel-template', { headers: auth });
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
    headers: { ...editorAuth, 'Content-Type': 'application/octet-stream', 'X-Template-Filename': encodeURIComponent('Suivi Été.xlsx') },
    body: bytes,
  });
  assert.equal(uploaded.status, 204);

  const downloaded = await call('/api/excel-template', { headers: viewerAuth });
  assert.equal(downloaded.status, 200);
  assert.equal(decodeURIComponent(downloaded.headers.get('x-template-filename') ?? ''), 'Suivi Été.xlsx');
  assert.equal(downloaded.data, bytes.toString());
});

test('uploading a new template replaces the previous single template row', async () => {
  const { auth } = await makeUser(Role.editor);
  await fetch(`${baseUrl}/api/excel-template`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/octet-stream', 'X-Template-Filename': encodeURIComponent('first.xlsx') },
    body: Buffer.from('first'),
  });
  await fetch(`${baseUrl}/api/excel-template`, {
    method: 'PUT',
    headers: { ...auth, 'Content-Type': 'application/octet-stream', 'X-Template-Filename': encodeURIComponent('second.xlsx') },
    body: Buffer.from('second'),
  });
  assert.equal(await prisma.excelTemplate.count(), 1);
  const r = await call('/api/excel-template', { headers: auth });
  assert.equal(r.data, 'second');
});

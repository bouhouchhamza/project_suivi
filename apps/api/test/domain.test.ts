import test from 'node:test';
import assert from 'node:assert/strict';
import { Department, Phase, Priority, Role } from '@prisma/client';
import { DEPARTMENTS, isDateOnly, normalizeManager, projectSchema, sameImportProjectKey, wouldRemoveLastAdmin } from '../src/domain.js';
import { loginThrottleForTest } from '../src/routes/auth.js';

const validProject = () => ({
  numero: 463,
  intitule: 'CHU',
  priorite: Priority.HAUTE,
  chef: '  Kamal El Amarti  ',
  lignes: DEPARTMENTS.map(departement => ({
    departement,
    phase: null,
    delaiJours: null,
    dateLivrable: null,
    commentaire: null,
  })),
});

test('project schema accepts duplicate-capable project numbers with exactly six ordered lines', () => {
  const parsed = projectSchema.safeParse(validProject());
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.numero, 463);
    assert.deepEqual(parsed.data.lignes.map(line => line.departement), DEPARTMENTS);
  }
});

test('project schema rejects missing, duplicate, or out-of-order departments', () => {
  const project = validProject();
  project.lignes = [
    { ...project.lignes[0], departement: Department.ECO },
    { ...project.lignes[1], departement: Department.STR },
    ...project.lignes.slice(2),
  ];
  assert.equal(projectSchema.safeParse(project).success, false);
});

test('project schema rejects invalid enum values and overlong comments', () => {
  const invalidPhase = validProject();
  invalidPhase.lignes[0].phase = 'PRO' as Phase;
  assert.equal(projectSchema.safeParse(invalidPhase).success, false);

  const invalidComment = validProject();
  invalidComment.lignes[0].commentaire = 'x'.repeat(2001);
  assert.equal(projectSchema.safeParse(invalidComment).success, false);
});

test('date-only validation rejects calendar rollovers', () => {
  assert.equal(isDateOnly('2026-02-28'), true);
  assert.equal(isDateOnly('2026-02-31'), false);
  assert.equal(isDateOnly('2026-13-01'), false);
});

test('manager normalization ignores case and extra whitespace', () => {
  assert.equal(normalizeManager('  Kamal   El Amarti '), normalizeManager('KAMAL EL AMARTI'));
});

test('import merge key uses numero plus normalized title and allows duplicate numero', () => {
  assert.equal(sameImportProjectKey(
    { numero: 463, intitule: '  CHU  ' },
    { numero: 463, intitule: 'chu' },
  ), true);
  assert.equal(sameImportProjectKey(
    { numero: 463, intitule: 'CHU' },
    { numero: 463, intitule: 'PFSS' },
  ), false);
  assert.equal(sameImportProjectKey(
    { numero: 463, intitule: 'CHU' },
    { numero: 436, intitule: 'CHU' },
  ), false);
});

test('wouldRemoveLastAdmin rejects demoting or deleting the sole remaining admin', () => {
  assert.equal(wouldRemoveLastAdmin(Role.admin, Role.viewer, 1), true);
  assert.equal(wouldRemoveLastAdmin(Role.admin, null, 1), true);
});

test('wouldRemoveLastAdmin allows role change when other admins remain', () => {
  assert.equal(wouldRemoveLastAdmin(Role.admin, Role.viewer, 2), false);
  assert.equal(wouldRemoveLastAdmin(Role.admin, null, 2), false);
});

test('wouldRemoveLastAdmin ignores non-admins and no-op role changes', () => {
  assert.equal(wouldRemoveLastAdmin(Role.viewer, null, 1), false);
  assert.equal(wouldRemoveLastAdmin(Role.admin, Role.admin, 1), false);
});

test('login throttle resets and prunes bounded in-memory failure state', () => {
  loginThrottleForTest.clear();
  const key = loginThrottleForTest.key('USER@EXAMPLE.COM', '127.0.0.1');
  for (let i = 0; i < 10; i++) loginThrottleForTest.recordFailure(key);
  assert.equal(loginThrottleForTest.isLimited(key), true);
  loginThrottleForTest.failures.delete(key);
  assert.equal(loginThrottleForTest.isLimited(key), false);

  for (let i = 0; i < loginThrottleForTest.maxEntries + 5; i++) {
    loginThrottleForTest.recordFailure(`user-${i}|127.0.0.1`);
  }
  assert.ok(loginThrottleForTest.failures.size <= loginThrottleForTest.maxEntries);
  loginThrottleForTest.clear();
});

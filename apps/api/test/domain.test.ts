import test from 'node:test';
import assert from 'node:assert/strict';
import { Department, Phase, Priority } from '@prisma/client';
import { compareProjectOrder, DEPARTMENTS, isDateOnly, isOverdueDate, normalizeManager, projectHasOverdueDeliverable, projectKpis, projectSchema, sameImportProjectKey, savedViewFiltersSchema, validateClientSlug } from '../src/domain.js';
import { getCompanySettings } from '../src/company-settings.js';
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

test('compareProjectOrder ranks HAUTE before MOYENNE before BASSE before no priority', () => {
  const haute = { priorite: Priority.HAUTE, priorityOrder: 5 };
  const moyenne = { priorite: Priority.MOYENNE, priorityOrder: 0 };
  const basse = { priorite: Priority.BASSE, priorityOrder: 0 };
  const none = { priorite: null, priorityOrder: 0 };
  const shuffled = [none, basse, moyenne, haute].sort(compareProjectOrder);
  assert.deepEqual(shuffled, [haute, moyenne, basse, none]);
});

test('compareProjectOrder uses priorityOrder as the tiebreaker within a priority group', () => {
  const first = { priorite: Priority.HAUTE, priorityOrder: 0 };
  const second = { priorite: Priority.HAUTE, priorityOrder: 1 };
  assert.equal(compareProjectOrder(first, second) < 0, true);
  assert.equal(compareProjectOrder(second, first) > 0, true);
  assert.equal(compareProjectOrder(first, first), 0);
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

test('client slug validation rejects path and shell unsafe values', () => {
  assert.equal(validateClientSlug('bureau-atlas'), true);
  assert.equal(validateClientSlug('../../etc'), false);
  assert.equal(validateClientSlug('CLIENT A'), false);
  assert.equal(validateClientSlug('foo/bar'), false);
  assert.equal(validateClientSlug('client;rm-rf'), false);
});

test('management KPIs count archived projects and delivery windows', () => {
  const today = new Date('2026-10-04T12:00:00.000Z');
  const kpis = projectKpis([
    {
      archivedAt: null,
      priorite: Priority.HAUTE,
      lignes: [
        { departement: Department.STR, dateLivrable: '2026-10-03' },
        { departement: Department.ECO, dateLivrable: '2026-10-04' },
        { departement: Department.FLU, dateLivrable: '2026-10-11' },
        { departement: Department.ELEC, dateLivrable: '2026-11-20' },
        { departement: Department.VRD, dateLivrable: null },
        { departement: Department.BIM, dateLivrable: '2026-10-30' },
      ],
    },
    { archivedAt: '2026-10-01', priorite: Priority.BASSE, lignes: [] },
  ], today);

  assert.equal(kpis.activeProjects, 1);
  assert.equal(kpis.archivedProjects, 1);
  assert.equal(kpis.highPriorityProjects, 1);
  assert.equal(kpis.overdueDeliverables, 1);
  assert.equal(kpis.dueTodayDeliverables, 1);
  assert.equal(kpis.dueNext7DaysDeliverables, 2);
  assert.equal(kpis.dueNext30DaysDeliverables, 3);
});

test('report company settings prefer persisted settings over environment fallback', async () => {
  const stored = {
    id: 'default',
    clientName: 'Bureau Atlas',
    clientSlug: 'bureau-atlas',
    appDomain: 'atlas.automateflow.pro',
    supportEmail: 'support@atlas.example',
    companyLogo: null,
    primaryColor: '#123456',
    timezone: 'Africa/Casablanca',
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
  };
  const settings = await getCompanySettings({
    companySettings: {
      findUnique: async () => stored,
    },
  } as any);

  assert.equal(settings.clientName, 'Bureau Atlas');
  assert.equal(settings.clientSlug, 'bureau-atlas');
});

test('calendar overdue logic treats today as not overdue and yesterday as overdue', () => {
  const today = new Date('2026-10-04T23:59:59.000Z');

  assert.equal(isOverdueDate('2026-10-04', today), false);
  assert.equal(isOverdueDate('2026-10-03', today), true);
});

test('saved view filters reject invalid priority and department values', () => {
  assert.equal(savedViewFiltersSchema.safeParse({
    priorities: ['URGENT'],
    chef: null,
    department: null,
    search: '',
    archived: false,
  }).success, false);

  assert.equal(savedViewFiltersSchema.safeParse({
    priorities: [Priority.HAUTE],
    chef: null,
    department: 'ARCHI',
    search: '',
    archived: false,
  }).success, false);

  assert.equal(savedViewFiltersSchema.safeParse({
    priorities: [Priority.HAUTE],
    chef: null,
    department: Department.STR,
    departments: ['ARCHI'],
    search: '',
    archived: false,
  }).success, false);
});

test('archived projects are excluded from active KPI and report overdue counts', () => {
  const today = new Date('2026-10-04T12:00:00.000Z');
  const projects = [
    {
      archivedAt: null,
      priorite: Priority.HAUTE,
      lignes: [{ departement: Department.STR, dateLivrable: '2026-10-03' }],
    },
    {
      archivedAt: '2026-10-01',
      priorite: Priority.HAUTE,
      lignes: [{ departement: Department.ECO, dateLivrable: '2026-10-02' }],
    },
  ];

  const kpis = projectKpis(projects, today);
  assert.equal(kpis.activeProjects, 1);
  assert.equal(kpis.archivedProjects, 1);
  assert.equal(kpis.highPriorityProjects, 1);
  assert.equal(kpis.overdueDeliverables, 1);
  assert.deepEqual(projects.filter(project => projectHasOverdueDeliverable(project, today)), [projects[0]]);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { buildChefChart, buildDeadlineChart, buildDepartmentChart, buildPriorityChart, chartSummary, DEPARTMENT_ORDER } from './chart-data';

test('priority chart keeps a fixed Haute/Moyenne/Basse order and fills gaps with zero', () => {
  const dataset = buildPriorityChart([{ label: 'BASSE', count: 3 }, { label: 'HAUTE', count: 5 }]);
  assert.deepEqual(dataset.labels, ['Haute', 'Moyenne', 'Basse']);
  assert.deepEqual(dataset.values, [5, 0, 3]);
  assert.equal(dataset.total, 8);
  assert.equal(dataset.isEmpty, false);
});

test('priority chart appends "Sans priorité" only when present in the data', () => {
  const withNone = buildPriorityChart([{ label: 'HAUTE', count: 1 }, { label: 'Sans priorité', count: 2 }]);
  assert.deepEqual(withNone.labels, ['Haute', 'Moyenne', 'Basse', 'Sans priorité']);
  assert.deepEqual(withNone.values, [1, 0, 0, 2]);

  const withoutNone = buildPriorityChart([{ label: 'HAUTE', count: 1 }]);
  assert.deepEqual(withoutNone.labels, ['Haute', 'Moyenne', 'Basse']);
});

test('priority chart reports an empty state when there is no data at all', () => {
  assert.equal(buildPriorityChart([]).isEmpty, true);
  assert.equal(buildPriorityChart([{ label: 'HAUTE', count: 0 }]).isEmpty, true);
});

test('department chart always exposes the six departments in business order', () => {
  const dataset = buildDepartmentChart([{ label: 'BIM', deliverables: 2 }, { label: 'STR', deliverables: 4 }]);
  assert.deepEqual(dataset.labels, [...DEPARTMENT_ORDER]);
  assert.deepEqual(dataset.values, [4, 0, 0, 0, 0, 2]);
  assert.equal(dataset.isEmpty, false);
});

test('department chart is empty when no deliverables exist', () => {
  assert.equal(buildDepartmentChart([]).isEmpty, true);
});

test('chef chart sorts by count and groups the long tail under "Autres"', () => {
  const dataset = buildChefChart([
    { label: 'A', count: 1 },
    { label: 'B', count: 9 },
    { label: 'C', count: 5 },
  ], 2);
  assert.deepEqual(dataset.labels, ['B', 'C', 'Autres']);
  assert.deepEqual(dataset.values, [9, 5, 1]);
});

test('chef chart omits "Autres" when every chef fits within the limit', () => {
  const dataset = buildChefChart([{ label: 'A', count: 1 }], 8);
  assert.deepEqual(dataset.labels, ['A']);
  assert.equal(dataset.isEmpty, false);
});

test('deadline chart maps kpi buckets in urgency order and tolerates missing data', () => {
  const dataset = buildDeadlineChart({ overdueDeliverables: 2, dueTodayDeliverables: 1, dueNext7DaysDeliverables: 4, dueNext30DaysDeliverables: 6 });
  assert.deepEqual(dataset.labels, ['En retard', "Aujourd'hui", '7 jours', '30 jours']);
  assert.deepEqual(dataset.values, [2, 1, 4, 6]);

  const empty = buildDeadlineChart(null);
  assert.deepEqual(empty.values, [0, 0, 0, 0]);
  assert.equal(empty.isEmpty, true);
});

test('chartSummary produces a readable accessible label', () => {
  const dataset = buildPriorityChart([{ label: 'HAUTE', count: 2 }]);
  assert.equal(chartSummary(dataset), 'Haute: 2, Moyenne: 0, Basse: 0');
});

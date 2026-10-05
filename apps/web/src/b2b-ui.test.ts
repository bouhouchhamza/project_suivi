import test from 'node:test';
import assert from 'node:assert/strict';
import { getApiMessage, getFieldErrors, markRead, removeSavedView, renameSavedView, reportCompanyTitle, selectSavedView, unreadCount } from './b2b-ui';

const savedViews = [
  { id: 'first', name: 'Première', filters: { search: 'a' } },
  { id: 'second', name: 'Deuxième', filters: { search: 'b' } },
];

test('saved-view helpers target the selected item, not the first item', () => {
  assert.deepEqual(selectSavedView(savedViews, 'second')?.filters, { search: 'b' });
  assert.deepEqual(renameSavedView(savedViews, 'second', 'Renommée').map(view => view.name), ['Première', 'Renommée']);
  assert.deepEqual(removeSavedView(savedViews, 'second').map(view => view.id), ['first']);
});

test('api helpers expose form validation feedback', () => {
  const error = Object.assign(new Error('Paramètres entreprise invalides.'), {
    data: { errors: { fieldErrors: { supportEmail: ['Email invalide'], clientSlug: ['Slug invalide'] } } },
  });

  assert.equal(getApiMessage(error), 'Paramètres entreprise invalides.');
  assert.deepEqual(getFieldErrors(error), { supportEmail: 'Email invalide', clientSlug: 'Slug invalide' });
});

test('notification helpers track read and unread state', () => {
  const items = [{ id: 'n1', readAt: null }, { id: 'n2', readAt: '2026-10-04T10:00:00.000Z' }];

  assert.equal(unreadCount(items), 1);
  assert.equal(unreadCount(markRead(items, 'n1', '2026-10-04T11:00:00.000Z')), 0);
});

test('report company title uses persisted company settings', () => {
  assert.equal(reportCompanyTitle({ clientName: 'Bureau Atlas', appDomain: 'atlas.example.test' }), 'Bureau Atlas - atlas.example.test');
  assert.equal(reportCompanyTitle({}), 'Rapport management');
});

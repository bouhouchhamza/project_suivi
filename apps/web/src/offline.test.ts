import test from 'node:test';
import assert from 'node:assert/strict';
import { flushOutbox, flushQueuedActions, outboxCount, queueAction, removeQueuedAction } from './offline';

class LocalStorageMock {
  store = new Map<string, string>();
  getItem(key: string) { return this.store.get(key) ?? null; }
  setItem(key: string, value: string) { this.store.set(key, value); }
  removeItem(key: string) { this.store.delete(key); }
  clear() { this.store.clear(); }
}

function installStorage() {
  Object.defineProperty(globalThis, 'localStorage', {
    value: new LocalStorageMock(),
    configurable: true,
  });
}

test('offline queue replays successful operations exactly once and removes them', async () => {
  installStorage();
  queueAction('/projects/1', 'PUT', { ok: true });
  const sent: string[] = [];
  const left = await flushQueuedActions(async action => { sent.push(action.path); });
  assert.deepEqual(sent, ['/projects/1']);
  assert.equal(left, 0);
  assert.equal(outboxCount(), 0);
});

test('offline queue stops on conflict, reports it, and keeps failed plus later operations', async () => {
  installStorage();
  const first = queueAction('/projects/1', 'PUT', { stale: true });
  queueAction('/projects/2', 'PUT', { later: true });
  let failedId = '';
  const left = await flushQueuedActions(async () => {
    throw Object.assign(new Error('Conflict'), { status: 409, data: { serverProject: { id: 'server' } } });
  }, action => { failedId = action.id; });
  assert.equal(failedId, first);
  assert.equal(left, 2);
  removeQueuedAction(first);
  assert.equal(outboxCount(), 1);
});

test('offline queue reports non-conflict failures and does not spin forever', async () => {
  installStorage();
  queueAction('/projects/1', 'PUT', {});
  let failures = 0;
  const left = await flushQueuedActions(async () => {
    throw Object.assign(new Error('Server unavailable'), { status: 503 });
  }, () => { failures++; });
  assert.equal(failures, 1);
  assert.equal(left, 1);
});

test('flushOutbox is single-flight and does not duplicate concurrent replay', async () => {
  installStorage();
  queueAction('/projects/1', 'PUT', {});
  let sends = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => {
    sends++;
    await new Promise(resolve => setTimeout(resolve, 10));
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  try {
    const [leftA, leftB] = await Promise.all([flushOutbox(), flushOutbox()]);
    assert.equal(leftA, 0);
    assert.equal(leftB, 0);
    assert.equal(sends, 1);
    assert.equal(outboxCount(), 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

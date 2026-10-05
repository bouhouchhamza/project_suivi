import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

test('notifications have a project relation that cascades on permanent project deletion', () => {
  const schema = readFileSync('prisma/schema.prisma', 'utf8');
  const migration = readFileSync('prisma/migrations/20261004190000_b2b_productization/migration.sql', 'utf8');

  assert.match(schema, /project\s+Project\?\s+@relation\(fields: \[projectId\], references: \[id\], onDelete: Cascade\)/);
  assert.match(migration, /CONSTRAINT "Notification_projectId_fkey"/);
  assert.match(migration, /REFERENCES "Project"\("id"\) ON DELETE CASCADE ON UPDATE CASCADE/);
});

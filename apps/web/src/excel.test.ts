import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { parseImport, remainingDays, writeExportBuffer } from './excel';
import type { Project } from './types';

async function workbookBuffer(sheets: { name: string; rows: unknown[][] }[]) {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    sheet.rows.forEach(row => ws.addRow(row));
  }
  return workbook.xlsx.writeBuffer();
}

const headers = ['N° PROJET', 'DESIGNATION PROJET', 'PRIORITE', 'AFFECTATION', 'DEPARTEMENT', 'PHASE', 'DELAI LIVRABLE', 'DATE LIVRABLE', 'COMMENTAIRE'];

test('parseImport selects a SUIVI sheet before other sheets', async () => {
  const parsed = await parseImport(await workbookBuffer([
    { name: 'Autre', rows: [headers, [999, 'Wrong', 'BASSE', '', 'STR', '', '', '', '']] },
    { name: 'SUIVI PROD', rows: [headers, [463, 'CHU', 'HAUTE', 'KAMAL EL AMARTI', 'STR', '-', 'not numeric', '03/10/2026', 'Structure']] },
  ]));
  assert.equal(parsed.projects[0].numero, 463);
});

test('parseImport falls back to the first sheet when no SUIVI sheet exists', async () => {
  const parsed = await parseImport(await workbookBuffer([
    { name: 'First', rows: [headers, [342, 'Fallback', 'MOYENNE', 'AMINA BOUABDALLAOUI', 'STR', 'APS', 3, '2026-10-03', '']] },
    { name: 'Second', rows: [headers, [999, 'Ignored', 'BASSE', '', 'STR', '', '', '', '']] },
  ]));
  assert.equal(parsed.projects[0].numero, 342);
});

test('parseImport supports numero header variants, blank numero child rows, duplicate numbers, and six-line normalization', async () => {
  const variantHeaders = ['N Projet', 'Désignation projet', 'Priorité', 'Affectation', 'Département', 'Phase', 'Délai livrable', 'Date livrable', 'Commentaire'];
  const parsed = await parseImport(await workbookBuffer([
    { name: 'SUIVI', rows: [
      variantHeaders,
      [463, 'CHU', 'HAUTE', 'KAMAL EL AMARTI', 'STR', '-', 'bad delay', '03/10/2026', 'Structure'],
      ['', '', '', '', 'ECO', 'APS', 5, 46300, 'Merged-style child row'],
      [463, 'PFSS', 'MOYENNE', 'KAMAL EL AMARTI', 'STR', 'APD', 7, '2026-10-04', 'Duplicate numero different title'],
    ] },
  ]));

  assert.equal(parsed.projects.length, 2);
  assert.deepEqual(parsed.projects.map(p => p.numero), [463, 463]);
  assert.equal(parsed.projects[0].lignes.length, 6);
  assert.deepEqual(parsed.projects[0].lignes.map((line: any) => line.departement), ['STR', 'ECO', 'FLU', 'ELEC', 'VRD', 'BIM']);
  assert.equal(parsed.projects[0].lignes[0].phase, null);
  assert.equal(parsed.projects[0].lignes[0].delaiJours, null);
  assert.equal(parsed.projects[0].lignes[0].dateLivrable, '2026-10-03');
  assert.equal(parsed.projects[0].lignes[1].dateLivrable, '2026-10-05');
  assert.equal(parsed.managers[0], 'KAMAL EL AMARTI');
});

test('remainingDays uses local calendar midnights', () => {
  assert.equal(remainingDays('2026-10-03', new Date(2026, 9, 1, 23, 30)), 2);
});

test('writeExportBuffer creates a reloadable SUIVI PROD workbook with expected structure', async () => {
  const project: Project = {
    id: 'p1',
    numero: 463,
    intitule: 'CHU',
    priorite: 'HAUTE',
    chef: 'KAMAL EL AMARTI',
    updatedAt: '2026-10-01T00:00:00.000Z',
    updatedBy: 'u1',
    lignes: ['STR', 'ECO', 'FLU', 'ELEC', 'VRD', 'BIM'].map((departement, i) => ({
      departement: departement as any,
      phase: i === 0 ? 'APS' : null,
      delaiJours: i === 0 ? 5 : null,
      dateLivrable: i === 0 ? '2026-10-06' : null,
      commentaire: i === 0 ? 'Exported' : null,
    })),
  };

  const buffer = await writeExportBuffer([project], new Date(2026, 9, 1));
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const ws = workbook.getWorksheet('SUIVI PROD');
  assert.ok(ws);
  assert.deepEqual((ws!.getRow(1).values as any[]).slice(1), [
    'N° PROJET',
    'DESIGNATION PROJET',
    'PRIORITE',
    'AFFECTATION',
    'DEPARTEMENT',
    'PHASE',
    'DELAI LIVRABLE (Jours)',
    'DATE LIVRABLE',
    'J- DATE RENDU',
    'COMMENTAIRE',
  ]);
  assert.equal(ws!.views[0].state, 'frozen');
  assert.equal(ws!.views[0].ySplit, 1);
  assert.equal(ws!.autoFilter, 'A1:J1');
assert.equal(ws!.getCell('A2').value, 463);
  assert.equal(ws!.getCell('I2').value, 5);
  assert.equal((ws!.getCell('H2').value as Date).getFullYear(), 2026);
  assert.equal(ws!.rowCount, 7);
});


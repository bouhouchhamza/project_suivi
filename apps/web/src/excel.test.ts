import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { buildExportFromTemplate, parseImport, remainingDays, writeExportBuffer } from './excel';
import type { Project } from './types';
import { DEPARTMENTS } from './types';

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

async function buildTemplateBuffer(projectBlocks: number) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('SUIVI PROD');
  ws.columns = [{ width: 12 }, { width: 30 }, { width: 11 }, { width: 20 }, { width: 14 }, { width: 9 }, { width: 15 }, { width: 15 }, { width: 40 }];
  const headerRow = ws.addRow(['N° PROJET', 'DESIGNATION PROJET', 'PRIORITE', 'AFFECTATION', 'DEPARTEMENT', 'PHASE', 'DELAI LIVRABLE', 'DATE LIVRABLE', 'COMMENTAIRE']);
  headerRow.height = 30;
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.eachCell(c => c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF112233' } });

  for (let b = 0; b < projectBlocks; b++) {
    for (let i = 0; i < 6; i++) {
      const row = ws.addRow([
        i === 0 ? 100 + b : '', i === 0 ? `Ancien projet ${b}` : '', i === 0 ? 'HAUTE' : '', i === 0 ? 'CHEF ANCIEN' : '',
        DEPARTMENTS[i], '-', '-', '-', i === 0 ? 'commentaire original' : '',
      ]);
      row.eachCell(c => c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } });
      if (i === 0) row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFAABBCC' } };
    }
  }
  return wb.xlsx.writeBuffer();
}

function blankLignes(): Project['lignes'] {
  return DEPARTMENTS.map(departement => ({ departement, phase: null, delaiJours: null, dateLivrable: null, commentaire: null }));
}

test('buildExportFromTemplate preserves template formatting and writes current business data', async () => {
  const buffer = await buildTemplateBuffer(1);
  const project: Project = {
    id: 'p1', numero: 999, intitule: 'Projet Actuel', priorite: 'MOYENNE', chef: 'Nouveau Chef',
    updatedAt: new Date().toISOString(), updatedBy: 'u1',
    lignes: DEPARTMENTS.map((departement, i) => ({
      departement, phase: i === 0 ? 'APD' : null, delaiJours: i === 0 ? 9 : null,
      dateLivrable: i === 0 ? '2026-11-01' : null, commentaire: i === 0 ? 'Nouveau commentaire' : null,
    })),
  };

  const wb = await buildExportFromTemplate(buffer as any, [project]);
  const ws = wb.getWorksheet('SUIVI PROD')!;

  assert.equal(ws.getRow(1).height, 30);
  assert.equal(ws.getRow(1).getCell(1).font?.bold, true);
  assert.equal(ws.getColumn(2).width, 30);

  assert.equal(ws.getCell('A2').value, 999);
  assert.equal(ws.getCell('B2').value, 'Projet Actuel');
  assert.equal(ws.getCell('C2').value, 'MOYENNE');
  assert.equal(ws.getCell('D2').value, 'Nouveau Chef');
  assert.equal(ws.getCell('G2').value, 9);
  assert.equal(ws.getCell('I2').value, 'Nouveau commentaire');

  assert.equal((ws.getCell('A2').border as any)?.top?.style, 'thin');
  assert.equal((ws.getCell('C2').fill as any)?.fgColor?.argb, 'FFAABBCC');
});

test('buildExportFromTemplate clones block styling for rows appended beyond the original template extent', async () => {
  const buffer = await buildTemplateBuffer(1);
  const projects: Project[] = [0, 1].map(n => ({
    id: `p${n}`, numero: 500 + n, intitule: `Projet ${n}`, priorite: 'HAUTE', chef: null,
    updatedAt: new Date().toISOString(), updatedBy: 'u1', lignes: blankLignes(),
  }));

  const wb = await buildExportFromTemplate(buffer as any, projects);
  const ws = wb.getWorksheet('SUIVI PROD')!;

  assert.equal(ws.getCell('A8').value, 501);
  assert.equal((ws.getCell('C8').fill as any)?.fgColor?.argb, 'FFAABBCC');
  assert.equal((ws.getCell('A8').border as any)?.top?.style, 'thin');
});

test('buildExportFromTemplate clears stale business data left over when fewer projects are exported', async () => {
  const buffer = await buildTemplateBuffer(2);
  const project: Project = {
    id: 'p1', numero: 777, intitule: 'Seul projet restant', priorite: 'BASSE', chef: null,
    updatedAt: new Date().toISOString(), updatedBy: 'u1', lignes: blankLignes(),
  };

  const wb = await buildExportFromTemplate(buffer as any, [project]);
  const ws = wb.getWorksheet('SUIVI PROD')!;

  assert.equal(ws.getCell('A8').value, null);
  assert.equal(ws.getCell('B8').value, null);
  assert.equal(ws.getCell('I8').value, null);
  assert.equal((ws.getCell('A8').border as any)?.top?.style, 'thin');
});

test('buildExportFromTemplate rejects a template with no recognizable header row, so callers can fall back', async () => {
  const wb0 = new ExcelJS.Workbook();
  const ws0 = wb0.addWorksheet('Feuille1');
  ws0.addRow(['Colonne A', 'Colonne B']);
  const buffer = await wb0.xlsx.writeBuffer();
  await assert.rejects(() => buildExportFromTemplate(buffer as any, []));
});


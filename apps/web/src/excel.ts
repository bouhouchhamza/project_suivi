import ExcelJS from 'exceljs';
import saveAs from 'file-saver';
import type { Phase, Priority, Project, ProjectLine } from './types';
import { DEPARTMENTS } from './types';

const norm = (v: unknown) => String(v ?? '').trim();
const normHeader = (v: unknown) => norm(v)
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleUpperCase('fr')
  .replace(/\s+/g, ' ');
const compactHeader = (v: unknown) => normHeader(v).replace(/[^A-Z0-9]/g, '');
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ymdUtc = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

function cellValue(value: ExcelJS.CellValue | undefined): unknown {
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    if ('text' in value) return value.text;
    if ('result' in value) return value.result;
    if ('richText' in value) return value.richText.map(part => part.text).join('');
  }
  return value;
}

function excelSerialDate(value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const wholeDays = Math.floor(value);
  const utc = new Date(Date.UTC(1899, 11, 30 + wholeDays));
  return ymdUtc(utc);
}

function excelDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return ymd(v);
  if (typeof v === 'number') return excelSerialDate(v);
  const s = norm(v);
  const fr = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2].padStart(2, '0')}-${fr[1].padStart(2, '0')}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
}

function findHeader(headers: unknown[], needle: string, exact = false) {
  const foldedNeedle = compactHeader(needle);
  return headers.findIndex(h => {
    const folded = compactHeader(h);
    return exact ? folded === foldedNeedle : folded.includes(foldedNeedle);
  });
}

function worksheetRows(ws: ExcelJS.Worksheet) {
  const rows: unknown[][] = [];
  const rowCount = ws.actualRowCount || ws.rowCount;
  const columnCount = ws.actualColumnCount || ws.columnCount;
  for (let rowNumber = 1; rowNumber <= rowCount; rowNumber++) {
    const row = ws.getRow(rowNumber);
    const values: unknown[] = [];
    for (let columnNumber = 1; columnNumber <= columnCount; columnNumber++) {
      values.push(cellValue(row.getCell(columnNumber).value));
    }
    rows.push(values);
  }
  return rows;
}

export async function parseImport(file: ArrayBuffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file);
  const ws = wb.worksheets.find(sheet => sheet.name.toLocaleUpperCase('fr').includes('SUIVI')) ?? wb.worksheets[0];
  if (!ws) throw new Error('Le classeur Excel ne contient aucune feuille.');
  const rows = worksheetRows(ws);

  let headerIndex = -1;
  let cols: Record<string, number> = {};
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const h = rows[i];
    const candidate = {
      numero: findHeader(h, 'N'),
      intitule: findHeader(h, 'DESIGNATION'),
      priorite: findHeader(h, 'PRIORITE'),
      chef: findHeader(h, 'AFFECTATION'),
      dep: findHeader(h, 'DEPARTEMENT'),
      phase: findHeader(h, 'PHASE', true),
      delai: findHeader(h, 'DELAI LIVRABLE'),
      date: findHeader(h, 'DATE LIVRABLE'),
      comment: findHeader(h, 'COMMENT'),
    };
    if (Object.values(candidate).every(v => Number(v) >= 0)) {
      headerIndex = i;
      cols = candidate;
      break;
    }
  }
  if (headerIndex < 0) {
    throw new Error('Colonnes Excel introuvables. Verifiez N°, DESIGNATION, PRIORITE, AFFECTATION, DEPARTEMENT, PHASE, DELAI LIVRABLE, DATE LIVRABLE et COMMENTAIRE.');
  }

  const projects: any[] = [];
  const managers = new Map<string, string>();
  let current: any = null;
  const pushCurrent = () => {
    if (!current) return;
    if (!current.intitule) throw new Error(`Le projet N° ${current.numero} n'a pas de designation.`);
    projects.push(current);
    current = null;
  };

  for (const row of rows.slice(headerIndex + 1)) {
    const fullyEmpty = row.every(v => v === null || norm(v) === '');
    if (fullyEmpty) continue;

    const numeroRaw = norm(row[cols.numero]);
    const rowChef = norm(row[cols.chef]) || null;
    if (rowChef) managers.set(rowChef.toLocaleUpperCase('fr'), rowChef);
    if (numeroRaw) {
      pushCurrent();
      const numero = Number(numeroRaw.replace(',', '.'));
      if (!Number.isFinite(numero) || !Number.isInteger(numero)) throw new Error(`Numero de projet invalide : ${numeroRaw}`);
      const priorityRaw = norm(row[cols.priorite]).toLocaleUpperCase('fr');
      current = {
        numero,
        intitule: norm(row[cols.intitule]),
        priorite: (['HAUTE', 'MOYENNE', 'BASSE'].includes(priorityRaw) ? priorityRaw : null) as Priority | null,
        chef: rowChef,
        lignes: [],
      };
    }

    if (!current) continue;
    if (rowChef && !current.chef) current.chef = rowChef;
    const dep = norm(row[cols.dep]).toLocaleUpperCase('fr');
    if (!dep) continue;
    if (!DEPARTMENTS.includes(dep as any)) continue;

    const phaseRaw = norm(row[cols.phase]).toLocaleUpperCase('fr');
    const delayText = norm(row[cols.delai]);
    const parsedDelay = delayText === '' ? null : Number(delayText.replace(',', '.'));
    const line: ProjectLine = {
      departement: dep as any,
      phase: phaseRaw === '-' || !['APS', 'APD', 'DCE', 'EXE'].includes(phaseRaw) ? null : phaseRaw as Phase,
      delaiJours: parsedDelay !== null && Number.isFinite(parsedDelay) ? Math.trunc(parsedDelay) : null,
      dateLivrable: excelDate(row[cols.date]),
      commentaire: norm(row[cols.comment]) || null,
    };
    current.lignes.push(line);
  }
  pushCurrent();

  for (const p of projects) {
    p.lignes = DEPARTMENTS.map(d => p.lignes.find((l: ProjectLine) => l.departement === d) ?? {
      departement: d,
      phase: null,
      delaiJours: null,
      dateLivrable: null,
      commentaire: null,
    });
  }
  return { projects, managers: [...managers.values()] };
}

export const remainingDays = (v: string | null, today = new Date()) => {
  if (!v) return null;
  const [y, m, d] = v.split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return Math.round((target.getTime() - localToday.getTime()) / 86400000);
};

const asLocalDate = (v: string) => {
  const [y, m, d] = v.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function buildExportWorkbook(projects: Project[], today = new Date()) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('SUIVI PROD', { views: [{ state: 'frozen', ySplit: 1 }] });
  const headers = ['N° PROJET', 'DESIGNATION PROJET', 'PRIORITE', 'AFFECTATION', 'DEPARTEMENT', 'PHASE', 'DELAI LIVRABLE (Jours)', 'DATE LIVRABLE', 'J- DATE RENDU', 'COMMENTAIRE'];
  ws.addRow(headers);
  ws.columns = [10, 34, 11, 24, 14, 9, 15, 15, 14, 42].map(width => ({ width }));
  ws.autoFilter = { from: 'A1', to: 'J1' };

  const header = ws.getRow(1);
  header.height = 32;
  header.font = { name: 'Calibri', size: 11, bold: true };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFDEADA' } };
  header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  header.eachCell(cell => cell.border = { top: { style: 'medium', color: { argb: 'FF8A93A0' } }, bottom: { style: 'medium', color: { argb: 'FF8A93A0' } } });

  for (const p of projects) {
    const start = ws.rowCount + 1;
    for (let i = 0; i < 6; i++) {
      const l = p.lignes[i];
      const j = remainingDays(l.dateLivrable, today);
      const row = ws.addRow([
        i === 0 ? p.numero : '', i === 0 ? p.intitule : '', i === 0 ? (p.priorite ?? '') : '', i === 0 ? (p.chef ?? '') : '',
        l.departement, l.phase ?? '-', l.delaiJours ?? '-', l.dateLivrable ? asLocalDate(l.dateLivrable) : '-', j ?? '-', l.commentaire ?? '',
      ]);
      row.font = { name: 'Calibri', size: 10.5 };
      row.getCell(1).font = { name: 'Calibri', size: 10.5, bold: i === 0 };
      row.getCell(2).font = { name: 'Calibri', size: 10.5, bold: i === 0 };
      if (l.dateLivrable) row.getCell(8).numFmt = 'dd/mm/yyyy';
      [1, 5, 6, 7, 9].forEach(c => row.getCell(c).alignment = { horizontal: 'center', vertical: 'middle' });
      [2, 10].forEach(c => row.getCell(c).alignment = { wrapText: true, vertical: 'top' });
      row.eachCell(c => c.border = { top: { style: 'thin', color: { argb: 'FFC9CDD3' } }, bottom: { style: 'thin', color: { argb: 'FFC9CDD3' } }, left: { style: 'thin', color: { argb: 'FFC9CDD3' } }, right: { style: 'thin', color: { argb: 'FFC9CDD3' } } });

      if (i === 0 && p.priorite) {
        const fill = p.priorite === 'HAUTE' ? 'FFF6E4DF' : p.priorite === 'MOYENNE' ? 'FFF5EBD8' : 'FFEAEDF0';
        row.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } };
      }
      const jc = row.getCell(9);
      jc.font = { name: 'Calibri', size: 10.5, bold: true };
      jc.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: j === null ? 'FFEAEDF0' : j <= 5 ? 'FFF6E4DF' : j <= 10 ? 'FFF5EBD8' : 'FFE3EEE6' } };
    }
    const end = ws.rowCount;
    [start, end].forEach(rn => ws.getRow(rn).eachCell(c => { c.border = { ...c.border, [rn === start ? 'top' : 'bottom']: { style: 'medium', color: { argb: 'FF8A93A0' } } }; }));
    for (let rn = start; rn <= end; rn++) {
      const left = ws.getRow(rn).getCell(1); left.border = { ...left.border, left: { style: 'medium', color: { argb: 'FF8A93A0' } } };
      const right = ws.getRow(rn).getCell(10); right.border = { ...right.border, right: { style: 'medium', color: { argb: 'FF8A93A0' } } };
    }
  }
  return wb;
}

export async function writeExportBuffer(projects: Project[], today = new Date()) {
  return buildExportWorkbook(projects, today).xlsx.writeBuffer();
}

export async function exportExcel(projects: Project[]) {
  const buf = await writeExportBuffer(projects);
  saveAs(new Blob([buf]), `Suivi_Projets_${ymd(new Date())}.xlsx`);
}

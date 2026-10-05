import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import ExcelJS from 'exceljs';
import { writeExportBuffer } from '../apps/web/src/excel';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@suivi.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!';

async function adminLogin(request: APIRequestContext) {
  const r = await request.post(`${BASE_URL}/api/auth/login`, { data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } });
  expect(r.ok()).toBeTruthy();
  const body = await r.json();
  return { token: body.token as string, headers: { Authorization: `Bearer ${body.token}` } };
}

async function uiLogin(page: Page, email: string, password: string) {
  await page.goto('/');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}

function departmentLignes() {
  return ['STR', 'ECO', 'FLU', 'ELEC', 'VRD', 'BIM'].map(departement => ({ departement, phase: null, delaiJours: null, dateLivrable: null, commentaire: null }));
}

test('forced password change blocks normal app usage until a new password is set', async ({ page, request }) => {
  const admin = await adminLogin(request);
  const email = 'e2e.forced-password@suivi.local';

  const list = await request.get(`${BASE_URL}/api/users`, { headers: admin.headers });
  const users = (await list.json()).data;
  let user = users.find((u: any) => u.email === email);
  if (!user) {
    const created = await request.post(`${BASE_URL}/api/users`, { headers: admin.headers, data: { name: 'E2E Forced Password', email, password: 'Initial123!', role: 'viewer' } });
    expect(created.ok()).toBeTruthy();
    user = (await created.json()).data;
  }

  // Admin-resetting the password guarantees a known temporary password AND mustChangePassword=true,
  // regardless of whether a previous run already cleared the flag for this user.
  const reset = await request.patch(`${BASE_URL}/api/users/${user.id}/password`, { headers: admin.headers, data: { password: 'TempGate123!' } });
  expect(reset.ok()).toBeTruthy();

  await uiLogin(page, email, 'TempGate123!');

  await expect(page.getByRole('heading', { name: 'Choisissez un nouveau mot de passe' })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole('button', { name: /Nouveau projet/ })).toHaveCount(0);

  await page.getByLabel('Mot de passe actuel', { exact: true }).fill('TempGate123!');
  await page.getByLabel('Nouveau mot de passe', { exact: true }).fill('PermanentGate123!');
  await page.getByLabel('Confirmer le nouveau mot de passe', { exact: true }).fill('PermanentGate123!');
  await page.getByRole('button', { name: 'Valider le nouveau mot de passe' }).click();

  await expect(page.getByText('Synchronisé')).toBeVisible({ timeout: 15_000 });

  const relogin = await request.post(`${BASE_URL}/api/auth/login`, { data: { email, password: 'PermanentGate123!' } });
  expect(relogin.ok()).toBeTruthy();
  expect((await relogin.json()).user.mustChangePassword).toBe(false);
});

test('persisted priority order survives create, priority change, and non-priority edit', async ({ page, request }) => {
  const admin = await adminLogin(request);
  const prefix = `E2E-PRIO-${Date.now()}`;
  const base = 910000 + Math.floor(Math.random() * 9000);

  async function createViaApi(numero: number, priorite: string) {
    const r = await request.post(`${BASE_URL}/api/projects`, { headers: admin.headers, data: { numero, intitule: `${prefix}-${numero}`, priorite, chef: null, lignes: departmentLignes() } });
    expect(r.ok()).toBeTruthy();
    return (await r.json()).data;
  }

  const p1 = await createViaApi(base + 1, 'HAUTE');
  const p2 = await createViaApi(base + 2, 'HAUTE');
  const p3 = await createViaApi(base + 3, 'MOYENNE');

  try {
    await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
    await expect(page.getByRole('button', { name: /Nouveau projet/ })).toBeVisible({ timeout: 15_000 });

    const numeros = await page.locator('tbody tr.projectStart td.mono').allTextContents();
    const idx1 = numeros.indexOf(String(p1.numero));
    const idx2 = numeros.indexOf(String(p2.numero));
    const idx3 = numeros.indexOf(String(p3.numero));
    expect(idx1).toBeGreaterThanOrEqual(0);
    expect(idx1).toBeLessThan(idx2);
    expect(idx2).toBeLessThan(idx3);

    // Move p1 from HAUTE to MOYENNE through the real UI save path; it must land at the end of MOYENNE, after p3.
    await page.locator('tbody tr').filter({ hasText: p1.intitule }).first().click();
    const editDialog = page.getByRole('dialog', { name: 'Modifier le projet' });
    await editDialog.getByLabel('Priorité').selectOption('MOYENNE');
    await editDialog.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(editDialog).toHaveCount(0);

    // Non-priority edit on p2 (still HAUTE): title changes, position must not move.
    await page.locator('tbody tr').filter({ hasText: p2.intitule }).first().click();
    const editDialog2 = page.getByRole('dialog', { name: 'Modifier le projet' });
    const newTitle = `${p2.intitule}-EDITED`;
    await editDialog2.getByLabel(/Intitulé/).fill(newTitle);
    await editDialog2.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(editDialog2).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('button', { name: /Nouveau projet/ })).toBeVisible({ timeout: 15_000 });

    const numerosAfter = await page.locator('tbody tr.projectStart td.mono').allTextContents();
    const afterIdx1 = numerosAfter.indexOf(String(p1.numero));
    const afterIdx2 = numerosAfter.indexOf(String(p2.numero));
    const afterIdx3 = numerosAfter.indexOf(String(p3.numero));

    // p2 is the only one of our three left in HAUTE; it must still sort before every MOYENNE project.
    expect(afterIdx2).toBeGreaterThanOrEqual(0);
    expect(afterIdx2).toBeLessThan(afterIdx3);
    // p1 moved into MOYENNE, after the original MOYENNE project p3.
    expect(afterIdx3).toBeLessThan(afterIdx1);
  } finally {
    for (const p of [p1, p2, p3]) {
      await request.delete(`${BASE_URL}/api/projects/${p.id}`, { headers: admin.headers, data: { baseUpdatedAt: p.updatedAt, force: true } }).catch(() => {});
    }
  }
});

test("admin can edit a user's name/email and deactivate/reactivate them through the UI", async ({ page, request }) => {
  const admin = await adminLogin(request);
  const email = `e2e.ui-edit.${Date.now()}@suivi.local`;

  const created = await request.post(`${BASE_URL}/api/users`, { headers: admin.headers, data: { name: 'E2E UI Edit', email, password: 'Initial123!', role: 'viewer' } });
  expect(created.ok()).toBeTruthy();

  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page.getByRole('button', { name: /Nouveau projet/ })).toBeVisible({ timeout: 15_000 });

  await page.locator('.user-menu summary').click();
  await page.getByRole('button', { name: 'Utilisateurs' }).click();

  const dialog = page.getByRole('dialog', { name: 'Utilisateurs' });
  await expect(dialog).toBeVisible();

  const row = dialog.locator('tbody tr').filter({ hasText: email });
  await expect(row).toBeVisible();
  const modifierButton = row.getByRole('button', { name: 'Modifier' });
  await modifierButton.scrollIntoViewIfNeeded();
  await modifierButton.click();

  // Once editing starts the name/email cells become inputs, so the row can no longer be
  // found by its old text - locate it by the presence of the edit input instead.
  const editingRow = dialog.locator('tbody tr').filter({ has: page.locator('input[aria-label="Email"]') });
  const newEmail = `edited.${Date.now()}@suivi.local`;
  await editingRow.getByLabel('Nom').fill('E2E UI Edit (modifie)');
  await editingRow.getByLabel('Email').fill(newEmail);
  const saveButton = editingRow.getByRole('button', { name: 'Enregistrer' });
  await saveButton.scrollIntoViewIfNeeded();
  await saveButton.click();

  const editedRow = dialog.locator('tbody tr').filter({ hasText: newEmail });
  await expect(editedRow).toBeVisible();
  await expect(editedRow).toContainText('E2E UI Edit (modifie)');

  const deactivateButton = editedRow.getByRole('button', { name: 'Désactiver' });
  await deactivateButton.scrollIntoViewIfNeeded();
  await deactivateButton.click();
  await expect(editedRow.getByRole('button', { name: 'Réactiver' })).toBeVisible();

  const blocked = await request.post(`${BASE_URL}/api/auth/login`, { data: { email: newEmail, password: 'Initial123!' } });
  expect(blocked.status()).toBe(403);

  const reactivateButton = editedRow.getByRole('button', { name: 'Réactiver' });
  await reactivateButton.scrollIntoViewIfNeeded();
  await reactivateButton.click();
  await expect(editedRow.getByRole('button', { name: 'Désactiver' })).toBeVisible();
});

test('Excel export uses an uploaded template and preserves a distinctive style marker', async ({ page, request }) => {
  const admin = await adminLogin(request);
  const numero = 920000 + Math.floor(Math.random() * 9000);
  const title = `E2E TEMPLATE ${Date.now()}`;

  const baseWorkbook = await writeExportBuffer([{
    id: 'e2e-template-source', numero, intitule: title, priorite: 'HAUTE', chef: null,
    updatedAt: new Date().toISOString(), updatedBy: 'e2e',
    lignes: departmentLignes() as any,
  } as any]);

  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(baseWorkbook as any);
  const ws = wb.getWorksheet('SUIVI PROD')!;
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF00FF00' } };
  const templateBuffer = Buffer.from(await wb.xlsx.writeBuffer());

  await uiLogin(page, ADMIN_EMAIL, ADMIN_PASSWORD);
  await expect(page.getByRole('button', { name: /Nouveau projet/ })).toBeVisible({ timeout: 15_000 });

  await page.getByRole('button', { name: 'Importer un fichier Excel' }).click();
  const importDialog = page.getByRole('dialog', { name: 'Importer un fichier Excel' });
  await importDialog.locator('input[type="file"]').setInputFiles({
    name: 'e2e-template.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    buffer: templateBuffer,
  });
  await importDialog.getByRole('radio', { name: /Fusionner/ }).check();

  const importResponse = page.waitForResponse(r => r.url().includes('/api/projects/import/bulk') && r.request().method() === 'POST');
  const templateResponse = page.waitForResponse(r => r.url().includes('/api/excel-template') && r.request().method() === 'PUT');
  await importDialog.getByRole('button', { name: 'Importer' }).click();
  await importResponse;
  await templateResponse;

  try {
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exporter en Excel' }).click(),
    ]);

    const exportedPath = await download.path();
    expect(exportedPath).toBeTruthy();

    const exportedWb = new ExcelJS.Workbook();
    await exportedWb.xlsx.readFile(exportedPath!);
    const exportedWs = exportedWb.getWorksheet('SUIVI PROD')!;
    const fill = exportedWs.getCell('A1').fill as any;
    expect(fill?.fgColor?.argb).toBe('FF00FF00');
  } finally {
    const list = await request.get(`${BASE_URL}/api/projects`, { headers: admin.headers });
    const projects = (await list.json()).data;
    const match = projects.find((p: any) => p.numero === numero && p.intitule === title);
    if (match) {
      await request.delete(`${BASE_URL}/api/projects/${match.id}`, { headers: admin.headers, data: { baseUpdatedAt: match.updatedAt, force: true } }).catch(() => {});
    }
  }
});

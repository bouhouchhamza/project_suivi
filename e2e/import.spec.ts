import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { writeExportBuffer } from '../apps/web/src/excel';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';

const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@suivi.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!';

const EDITOR = {
  name: 'E2E Editor',
  email: 'e2e.editor@suivi.local',
  password: 'E2E-Test-2026!',
  role: 'editor',
};

async function loginApi(
  request: APIRequestContext,
  email: string,
  password: string
) {
  const r = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { email, password },
  });

  if (!r.ok()) {
    throw new Error(
      `Login ${email} failed: ${r.status()} ${await r.text()}`
    );
  }

  return r.json();
}

async function ensureEditor(request: APIRequestContext) {
  const admin = await loginApi(
    request,
    ADMIN_EMAIL,
    ADMIN_PASSWORD
  );

  const headers = {
    Authorization: `Bearer ${admin.token}`,
  };

  const list = await request.get(`${BASE_URL}/api/users`, {
    headers,
  });

  expect(list.status()).toBe(200);

  const users = (await list.json()).data;

  const existing = users.find(
    (u: any) => u.email.toLowerCase() === EDITOR.email
  );

  if (!existing) {
    const created = await request.post(`${BASE_URL}/api/users`, {
      headers,
      data: EDITOR,
    });

    expect(created.status()).toBe(201);
  }

  // Admin-created accounts start with mustChangePassword=true; clear it so the
  // UI login below reaches the normal app instead of the forced-change gate.
  const editorLogin = await loginApi(
    request,
    EDITOR.email,
    EDITOR.password
  );

  if (editorLogin.user?.mustChangePassword) {
    await request.patch(`${BASE_URL}/api/auth/password`, {
      headers: { Authorization: `Bearer ${editorLogin.token}` },
      data: {
        currentPassword: EDITOR.password,
        newPassword: EDITOR.password,
      },
    });
  }
}

async function uiLogin(page: Page) {
  await page.goto('/');

  await page.getByLabel('Email').fill(EDITOR.email);
  await page.getByLabel('Mot de passe').fill(EDITOR.password);

  await page
    .getByRole('button', { name: 'Se connecter' })
    .click();

  await expect(page.getByText('Synchronisé')).toBeVisible({
    timeout: 15_000,
  });
}

async function uploadAndMerge(
  page: Page,
  buffer: Buffer
) {
  await page
    .getByRole('button', {
      name: 'Importer un fichier Excel',
    })
    .click();

  const dialog = page.getByRole('dialog', {
    name: 'Importer un fichier Excel',
  });

  await expect(dialog).toBeVisible();

  await dialog
    .locator('input[type="file"]')
    .setInputFiles({
      name: 'e2e-import.xlsx',
      mimeType:
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer,
    });

  const merge = dialog.getByRole('radio', {
    name: /Fusionner/,
  });

  await merge.check();

  const importButton = dialog.getByRole('button', {
    name: 'Importer',
  });

  await expect(importButton).toBeEnabled();

  const responsePromise = page.waitForResponse(
    r =>
      r.url().includes('/api/projects/import/bulk') &&
      r.request().method() === 'POST'
  );

  await importButton.click();

  const response = await responsePromise;

  if (!response.ok()) {
    throw new Error(
      `Import failed: ${response.status()} ${await response.text()}`
    );
  }

  return response.json();
}

test('Excel merge import creates once and does not duplicate', async ({
  browser,
  request,
}) => {
  await ensureEditor(request);

  const editorAuth = await loginApi(
    request,
    EDITOR.email,
    EDITOR.password
  );

  const headers = {
    Authorization: `Bearer ${editorAuth.token}`,
  };

  const numero =
    860000 + Math.floor(Math.random() * 10000);

  const title = `E2E IMPORT ${Date.now()}`;

  const departments = [
    'STR',
    'ECO',
    'FLU',
    'ELEC',
    'VRD',
    'BIM',
  ];

  const workbook = await writeExportBuffer([
    {
      id: 'e2e-import-source',
      numero,
      intitule: title,
      priorite: 'MOYENNE',
      chef: null,
      updatedAt: new Date().toISOString(),
      updatedBy: 'e2e',
      lignes: departments.map((departement, index) => ({
        id: `line-${index}`,
        departement,
        phase: index === 0 ? 'APS' : null,
        delaiJours: index === 0 ? 5 : null,
        dateLivrable:
          index === 0 ? '2026-10-15' : null,
        commentaire:
          index === 0 ? 'Import E2E' : null,
      })),
    } as any,
  ]);

  const fileBuffer = Buffer.from(workbook as any);

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await uiLogin(page);

    // Premier import
    const first = await uploadAndMerge(
      page,
      fileBuffer
    );

    expect(first.count).toBe(1);

    await expect(
      page.getByText(title, { exact: true })
    ).toBeVisible({
      timeout: 15_000,
    });

    // Vérification côté API
    let list = await request.get(
      `${BASE_URL}/api/projects`,
      { headers }
    );

    let projects = (await list.json()).data;

    let matches = projects.filter(
      (p: any) =>
        p.numero === numero &&
        p.intitule === title
    );

    expect(matches).toHaveLength(1);

    expect(matches[0].lignes).toHaveLength(6);

    expect(
      matches[0].lignes.find(
        (l: any) => l.departement === 'STR'
      )?.delaiJours
    ).toBe(5);

    // Deuxième import du même fichier en Fusionner
    const second = await uploadAndMerge(
      page,
      fileBuffer
    );

    expect(second.count).toBe(1);

    // Toujours un seul projet: pas de duplication
    list = await request.get(
      `${BASE_URL}/api/projects`,
      { headers }
    );

    projects = (await list.json()).data;

    matches = projects.filter(
      (p: any) =>
        p.numero === numero &&
        p.intitule === title
    );

    expect(matches).toHaveLength(1);

  } finally {
    // Cleanup
    const list = await request.get(
      `${BASE_URL}/api/projects`,
      { headers }
    );

    if (list.ok()) {
      const projects = (await list.json()).data;

      const matches = projects.filter(
        (p: any) =>
          p.numero === numero &&
          p.intitule === title
      );

      for (const project of matches) {
        await request.delete(
          `${BASE_URL}/api/projects/${project.id}`,
          {
            headers,
            data: {
              baseUpdatedAt: project.updatedAt,
              force: true,
            },
          }
        );
      }
    }

    await context.close();
  }
});

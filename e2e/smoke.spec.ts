import { test, expect, type Page, type APIRequestContext } from '@playwright/test';

const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:8080';
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? 'admin@suivi.local';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'ChangeMe123!';

async function login(page: Page) {
  await page.goto('/');

  await page.getByLabel('Email').fill(ADMIN_EMAIL);
  await page.getByLabel('Mot de passe').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Se connecter' }).click();

  await expect(
    page.getByRole('button', { name: /Nouveau projet/ })
  ).toBeVisible();
}

async function cleanup(request: APIRequestContext, prefix: string) {
  const auth = await request.post(`${BASE_URL}/api/auth/login`, {
    data: {
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
    },
  });

  if (!auth.ok()) return;

  const authBody = await auth.json();
  const token = authBody.token as string;

  const list = await request.get(`${BASE_URL}/api/projects`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!list.ok()) return;

  const body = await list.json();

  for (const project of body.data ?? []) {
    if (!String(project.intitule).startsWith(prefix)) continue;

    await request.delete(
      `${BASE_URL}/api/projects/${project.id}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
        data: {
          baseUpdatedAt: project.updatedAt,
          force: true,
        },
      }
    );
  }
}

test('login + CRUD + realtime + conflict + filters + export', async ({
  browser,
  request,
}) => {
  const prefix = `E2E-${Date.now()}`;
  const title = `${prefix}-ORIGINAL`;
  const adminTitle = `${prefix}-ADMIN`;
  const staleTitle = `${prefix}-STALE`;
  const numero = 900000 + Math.floor(Math.random() * 90000);

  const contextA = await browser.newContext({
    acceptDownloads: true,
  });

  const contextB = await browser.newContext();

  const pageA = await contextA.newPage();
  const pageB = await contextB.newPage();

  try {
    // 1. Login dans deux sessions séparées
    await login(pageA);
    await login(pageB);

    // Socket.IO doit être connecté
    await expect(pageA.getByText('Synchronisé')).toBeVisible({
      timeout: 15_000,
    });

    await expect(pageB.getByText('Synchronisé')).toBeVisible({
      timeout: 15_000,
    });

    // 2. Création
    await pageA
      .getByRole('button', { name: /Nouveau projet/ })
      .click();

    const createDialog = pageA.getByRole('dialog', {
      name: 'Nouveau projet',
    });

    await createDialog
      .getByLabel(/N° Projet/)
      .fill(String(numero));

    await createDialog
      .getByLabel(/Intitulé/)
      .fill(title);

    await createDialog
      .getByLabel('Priorité')
      .selectOption('HAUTE');

    const createResponsePromise = pageA.waitForResponse(
      response =>
        response.url().includes('/api/projects') &&
        response.request().method() === 'POST',
      { timeout: 10_000 }
    );

    await createDialog
      .getByRole('button', { name: 'Enregistrer' })
      .click();

    const createResponse = await createResponsePromise;
    const createText = await createResponse.text();


    expect(createResponse.ok()).toBeTruthy();

    const createdProject = JSON.parse(createText);
    expect(
      createdProject.data.lignes.every(
        (line: any) => line.delaiJours === null
      )
    ).toBeTruthy();

    await expect(
      pageA.getByText(title, { exact: true })
    ).toBeVisible({
      timeout: 10_000,
    });

    // 3. Realtime:
    // le deuxième navigateur doit recevoir le projet sans refresh
    await expect(
      pageB.getByText(title, { exact: true })
    ).toBeVisible({
      timeout: 15_000,
    });

    // 4. Filtre recherche
    const search = pageA.getByPlaceholder(
      'N° projet ou intitulé…'
    );

    await search.fill(title);

    await expect(
      pageA.getByText('6 ligne(s) affichée(s)')
    ).toBeVisible();

    await search.fill('');

    // 5. Les deux sessions ouvrent la même version
    await pageA
      .locator('tbody tr')
      .filter({ hasText: title })
      .first()
      .click();

    await pageB
      .locator('tbody tr')
      .filter({ hasText: title })
      .first()
      .click();

    const editA = pageA.getByRole('dialog', {
      name: 'Modifier le projet',
    });

    const editB = pageB.getByRole('dialog', {
      name: 'Modifier le projet',
    });

    // 6. A sauvegarde une version plus récente
    await editA
      .getByLabel(/Intitulé/)
      .fill(adminTitle);

    await editA
      .getByRole('button', { name: 'Enregistrer' })
      .click();

    await expect(
      pageA.getByText(adminTitle, { exact: true })
    ).toBeVisible();

    // 7. B tente de sauvegarder sa vieille version
    await editB
      .getByLabel(/Intitulé/)
      .fill(staleTitle);

    await editB
      .getByRole('button', { name: 'Enregistrer' })
      .click();

    const conflict = pageB.getByRole('alertdialog');

    await expect(
      conflict.getByText('Conflit de modification')
    ).toBeVisible();

    // Aucun silent overwrite
    await conflict
      .getByRole('button', {
        name: 'Recharger leur version',
      })
      .click();

    await expect(
      pageB
        .getByRole('dialog', {
          name: 'Modifier le projet',
        })
        .getByLabel(/Intitulé/)
    ).toHaveValue(adminTitle);

    // Fermer le panel après vérification
    await pageB
      .getByRole('dialog', {
        name: 'Modifier le projet',
      })
      .getByRole('button', { name: 'Fermer' })
      .click();

    // 8. Export réel
    const [download] = await Promise.all([
      pageA.waitForEvent('download'),
      pageA
        .getByRole('button', {
          name: 'Exporter en Excel',
        })
        .click(),
    ]);

    expect(download.suggestedFilename()).toMatch(
      /^Suivi_Projets_\d{4}-\d{2}-\d{2}\.xlsx$/
    );

    expect(await download.path()).toBeTruthy();

    // 9. Archivage du projet test
    await pageA
      .locator('tbody tr')
      .filter({ hasText: adminTitle })
      .first()
      .click();

    const deletePanel = pageA.getByRole('dialog', {
      name: 'Modifier le projet',
    });

    await deletePanel
      .getByRole('button', {
        name: 'Archiver le projet',
      })
      .click();

    const deleteDialog = pageA.getByRole('alertdialog');

    await expect(
      deleteDialog.getByText('Archiver le projet ?')
    ).toBeVisible();

    await deleteDialog
      .getByRole('button', {
        name: 'Archiver',
      })
      .click();

    // Archivage reçu en realtime par B: le projet sort de la vue active.
    await expect(
      pageB.getByText(adminTitle, { exact: true })
    ).toHaveCount(0, {
      timeout: 15_000,
    });
  } finally {
    // Cleanup même si le test casse au milieu
    await cleanup(request, prefix);

    await contextA.close();
    await contextB.close();
  }
});

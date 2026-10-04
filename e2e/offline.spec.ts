import { test, expect, type APIRequestContext, type Page } from '@playwright/test';

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
      `Login failed: ${r.status()} ${await r.text()}`
    );
  }

  return r.json();
}

async function ensureEditor(
  request: APIRequestContext
) {
  const admin = await loginApi(
    request,
    ADMIN_EMAIL,
    ADMIN_PASSWORD
  );

  const headers = {
    Authorization: `Bearer ${admin.token}`,
  };

  const users = await request.get(`${BASE_URL}/api/users`, {
    headers,
  });

  const body = await users.json();

  let editor = body.data.find(
    (u: any) => u.email === EDITOR.email
  );

  if (!editor) {
    const created = await request.post(
      `${BASE_URL}/api/users`,
      {
        headers,
        data: EDITOR,
      }
    );

    expect(created.status()).toBe(201);
    editor = (await created.json()).data;
  }

  if (editor.role !== 'editor') {
    const changed = await request.patch(
      `${BASE_URL}/api/users/${editor.id}/role`,
      {
        headers,
        data: { role: 'editor' },
      }
    );

    expect(changed.ok()).toBeTruthy();
  }
}

async function uiLogin(
  page: Page,
  email: string,
  password: string
) {
  await page.goto('/');

  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Mot de passe').fill(password);

  await page
    .getByRole('button', { name: 'Se connecter' })
    .click();

  await expect(page.getByText('Synchronisé')).toBeVisible({
    timeout: 15_000,
  });
}

function projectPayload(title: string) {
  return {
    numero: 870000 + Math.floor(Math.random() * 10000),
    intitule: title,
    priorite: 'MOYENNE',
    chef: null,
    lignes: ['STR','ECO','FLU','ELEC','VRD','BIM'].map(
      departement => ({
        departement,
        phase: null,
        delaiJours: null,
        dateLivrable: null,
        commentaire: null,
      })
    ),
  };
}

test('offline edit is queued then replayed once online', async ({
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

  const originalTitle = `E2E OFFLINE ${Date.now()}`;
  const offlineTitle = `${originalTitle} UPDATED`;

  const createdResponse = await request.post(
    `${BASE_URL}/api/projects`,
    {
      headers,
      data: projectPayload(originalTitle),
    }
  );

  expect(createdResponse.status()).toBe(201);

  const created = (await createdResponse.json()).data;

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await uiLogin(
      page,
      EDITOR.email,
      EDITOR.password
    );

    await page
      .locator('tbody tr')
      .filter({ hasText: originalTitle })
      .first()
      .click();

    const panel = page.getByRole('dialog', {
      name: 'Modifier le projet',
    });

    await expect(panel).toBeVisible();

    // Passage hors ligne réel côté navigateur
    await context.setOffline(true);

    await expect(page.getByText('Synchronisé')).toHaveCount(0, {
      timeout: 10_000,
    });

    await panel
      .getByLabel(/Intitulé/)
      .fill(offlineTitle);

    await panel
      .getByRole('button', { name: 'Enregistrer' })
      .click();

    // L'action doit être dans l'outbox
    await expect.poll(async () => {
      return page.evaluate(() => {
        const raw = localStorage.getItem('suivi_outbox');
        return raw ? JSON.parse(raw).length : 0;
      });
    }).toBe(1);

    // Le serveur ne doit PAS encore avoir reçu la modification
    const beforeReplay = await request.get(
      `${BASE_URL}/api/projects`,
      { headers }
    );

    const beforeData = await beforeReplay.json();

    const beforeProject = beforeData.data.find(
      (p: any) => p.id === created.id
    );

    expect(beforeProject.intitule).toBe(originalTitle);

    // Retour en ligne -> replay automatique
    await context.setOffline(false);

    await expect.poll(
      async () => {
        const r = await request.get(
          `${BASE_URL}/api/projects`,
          { headers }
        );

        const body = await r.json();

        return body.data.find(
          (p: any) => p.id === created.id
        )?.intitule;
      },
      {
        timeout: 15_000,
      }
    ).toBe(offlineTitle);

    // Outbox vidée
    await expect.poll(async () => {
      return page.evaluate(() => {
        const raw = localStorage.getItem('suivi_outbox');
        return raw ? JSON.parse(raw).length : 0;
      });
    }).toBe(0);

  } finally {
    await context.setOffline(false).catch(() => {});

    const latest = await request.get(
      `${BASE_URL}/api/projects`,
      { headers }
    );

    if (latest.ok()) {
      const body = await latest.json();

      const project = body.data.find(
        (p: any) => p.id === created.id
      );

      if (project) {
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

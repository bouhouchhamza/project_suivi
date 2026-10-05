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

const VIEWER = {
  name: 'E2E Viewer',
  email: 'e2e.viewer@suivi.local',
  password: 'E2E-Test-2026!',
  role: 'viewer',
};

async function apiLogin(
  request: APIRequestContext,
  email: string,
  password: string
) {
  const response = await request.post(`${BASE_URL}/api/auth/login`, {
    data: { email, password },
  });

  if (!response.ok()) {
    throw new Error(
      `Login ${email} failed: ${response.status()} ${await response.text()}`
    );
  }

  return response.json();
}

async function ensureUser(
  request: APIRequestContext,
  adminToken: string,
  user: typeof EDITOR
) {
  const headers = {
    Authorization: `Bearer ${adminToken}`,
  };

  const list = await request.get(`${BASE_URL}/api/users`, { headers });

  expect(list.status()).toBe(200);

  const body = await list.json();

  let existing = body.data.find(
    (u: any) => u.email.toLowerCase() === user.email.toLowerCase()
  );

  if (!existing) {
    const created = await request.post(`${BASE_URL}/api/users`, {
      headers,
      data: user,
    });

    if (!created.ok()) {
      throw new Error(
        `Create ${user.role} failed: ${created.status()} ${await created.text()}`
      );
    }

    existing = (await created.json()).data;
  }

  if (existing.role !== user.role) {
    const changed = await request.patch(
      `${BASE_URL}/api/users/${existing.id}/role`,
      {
        headers,
        data: { role: user.role },
      }
    );

    expect(changed.ok()).toBeTruthy();
  }

  // Admin-created accounts start with mustChangePassword=true; clear it so the
  // UI login below reaches the normal app instead of the forced-change gate.
  const userLogin = await apiLogin(request, user.email, user.password);

  if (userLogin.user?.mustChangePassword) {
    await request.patch(`${BASE_URL}/api/auth/password`, {
      headers: { Authorization: `Bearer ${userLogin.token}` },
      data: {
        currentPassword: user.password,
        newPassword: user.password,
      },
    });
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

function projectPayload() {
  const departments = ['STR', 'ECO', 'FLU', 'ELEC', 'VRD', 'BIM'];

  return {
    numero: 880000 + Math.floor(Math.random() * 10000),
    intitule: `E2E ROLE ${Date.now()}`,
    priorite: 'BASSE',
    chef: null,
    lignes: departments.map(departement => ({
      departement,
      phase: null,
      delaiJours: null,
      dateLivrable: null,
      commentaire: null,
    })),
  };
}

test('RBAC admin / editor / viewer', async ({
  browser,
  request,
}) => {
  // Admin
  const admin = await apiLogin(
    request,
    ADMIN_EMAIL,
    ADMIN_PASSWORD
  );

  const adminToken = admin.token as string;

  // Comptes E2E idempotents
  await ensureUser(request, adminToken, EDITOR);
  await ensureUser(request, adminToken, VIEWER);

  const editor = await apiLogin(
    request,
    EDITOR.email,
    EDITOR.password
  );

  const viewer = await apiLogin(
    request,
    VIEWER.email,
    VIEWER.password
  );

  const adminHeaders = {
    Authorization: `Bearer ${adminToken}`,
  };

  const editorHeaders = {
    Authorization: `Bearer ${editor.token}`,
  };

  const viewerHeaders = {
    Authorization: `Bearer ${viewer.token}`,
  };

  // Admin peut gérer les utilisateurs
  expect(
    (
      await request.get(`${BASE_URL}/api/users`, {
        headers: adminHeaders,
      })
    ).status()
  ).toBe(200);

  // Editor / viewer ne peuvent pas gérer les utilisateurs
  expect(
    (
      await request.get(`${BASE_URL}/api/users`, {
        headers: editorHeaders,
      })
    ).status()
  ).toBe(403);

  expect(
    (
      await request.get(`${BASE_URL}/api/users`, {
        headers: viewerHeaders,
      })
    ).status()
  ).toBe(403);

  // Viewer ne peut pas créer de projet
  const denied = await request.post(
    `${BASE_URL}/api/projects`,
    {
      headers: viewerHeaders,
      data: projectPayload(),
    }
  );

  expect(denied.status()).toBe(403);

  // Editor peut créer
  const createdResponse = await request.post(
    `${BASE_URL}/api/projects`,
    {
      headers: editorHeaders,
      data: projectPayload(),
    }
  );

  expect(createdResponse.status()).toBe(201);

  const created = (await createdResponse.json()).data;

  try {
    // UI Editor
    const editorContext = await browser.newContext();
    const editorPage = await editorContext.newPage();

    await uiLogin(
      editorPage,
      EDITOR.email,
      EDITOR.password
    );

    await expect(
      editorPage.getByRole('button', {
        name: /Nouveau projet/,
      })
    ).toBeVisible();

    await expect(
      editorPage.getByRole('button', {
        name: 'Importer un fichier Excel',
      })
    ).toBeVisible();

    await editorContext.close();

    // UI Viewer
    const viewerContext = await browser.newContext();
    const viewerPage = await viewerContext.newPage();

    await uiLogin(
      viewerPage,
      VIEWER.email,
      VIEWER.password
    );

    await expect(
      viewerPage.getByRole('button', {
        name: /Nouveau projet/,
      })
    ).toHaveCount(0);

    await expect(
      viewerPage.getByRole('button', {
        name: 'Importer un fichier Excel',
      })
    ).toHaveCount(0);

    await expect(
      viewerPage.getByRole('button', {
        name: 'Exporter en Excel',
      })
    ).toBeVisible();

    await viewerContext.close();
  } finally {
    // Nettoyage du projet créé par le test
    await request.delete(
      `${BASE_URL}/api/projects/${created.id}`,
      {
        headers: editorHeaders,
        data: {
          baseUpdatedAt: created.updatedAt,
          force: true,
        },
      }
    );
  }
});

// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Onda 8 — login obrigatório com Google via Supabase Auth.
// O client real (supabase-js via esm.sh) é carregado, mas toda chamada REST é
// interceptada — não fazemos OAuth de verdade nem tocamos o projeto real.
// A sessão "logada" é simulada pré-populando o localStorage com a chave que
// o supabase-js usa para persistir sessão (sb-<project-ref>-auth-token),
// exatamente como ficaria depois de um login real.

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const supabaseUrl = html.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1];
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const STORAGE_KEY = `sb-${projectRef}-auth-token`;

const FAKE_USER = {
  id: '11111111-1111-1111-1111-111111111111',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'teste@example.com',
  user_metadata: { full_name: 'Usuária Teste' },
  app_metadata: {},
  created_at: new Date().toISOString(),
};

function fakeSession() {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    user: FAKE_USER,
  };
}

async function mockFeedContent(page) {
  await page.route('**/rest/v1/feed_content**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
}

async function mockProfiles(page) {
  await page.route('**/rest/v1/profiles**', (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      // nenhuma linha existente -> app tenta criar o profile
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else if (method === 'POST') {
      route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    } else {
      route.continue();
    }
  });
}

test('sem sessão ativa, mostra a tela de login e não renderiza o app', async ({ page }) => {
  await mockFeedContent(page);

  await page.goto('/');

  await expect(page.locator('#loginScreen')).toBeVisible();
  await expect(page.locator('#loginBtn')).toBeVisible();
  await expect(page.locator('#loginBtn')).toHaveText(/Entrar com Google/);

  await expect(page.locator('#app')).toBeHidden();
  await expect(page.locator('#tabInicio')).toBeHidden();
});

test('com sessão mockada, esconde o login e renderiza as 4 abas com o usuário no header', async ({ page }) => {
  await mockFeedContent(page);
  await mockProfiles(page);

  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
    },
    { key: STORAGE_KEY, session: fakeSession() }
  );

  await page.goto('/');

  await expect(page.locator('#loginScreen')).toBeHidden();
  await expect(page.locator('#app')).toBeVisible();

  await expect(page.locator('#tabInicio')).toBeVisible();
  await expect(page.locator('#tabHoje')).toBeVisible();
  await expect(page.locator('#tabAmanha')).toBeVisible();
  await expect(page.locator('#tabProva')).toBeVisible();

  await expect(page.locator('#headerUser')).toBeVisible();
  await expect(page.locator('#userLabel')).toHaveText('Usuária Teste');
});

test('logout volta para a tela de login', async ({ page }) => {
  await mockFeedContent(page);
  await mockProfiles(page);

  await page.route('**/auth/v1/logout**', (route) => {
    route.fulfill({ status: 204, contentType: 'application/json', body: '' });
  });

  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
    },
    { key: STORAGE_KEY, session: fakeSession() }
  );

  await page.goto('/');
  await expect(page.locator('#app')).toBeVisible();

  await page.locator('#logoutBtn').click();

  await expect(page.locator('#loginScreen')).toBeVisible();
  await expect(page.locator('#app')).toBeHidden();
});

// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Onda 7 — fundação Supabase: só valida que o client conecta e a query em
// feed_content roda sem erro, mesmo com lista vazia. Não testa auth nem UX
// (isso vem em ondas futuras). Como SUPABASE_URL/ANON_KEY no index.html
// ainda são placeholders (o usuário preenche depois), interceptamos a
// chamada REST do PostgREST e respondemos com uma lista vazia — o que basta
// pra provar que createClient() não quebra e que a leitura de feed_content
// é tratada com segurança quando não há conteúdo.
//
// Desde a Onda 8 (login obrigatório) o app só renderiza com sessão ativa,
// então simulamos uma sessão logada pré-populando o localStorage com a
// mesma chave que o supabase-js usa para persistir sessão.

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const supabaseUrl = html.match(/SUPABASE_URL\s*=\s*'([^']+)'/)[1];
const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
const STORAGE_KEY = `sb-${projectRef}-auth-token`;

function fakeSession() {
  const now = Math.floor(Date.now() / 1000);
  return {
    access_token: 'fake-access-token',
    refresh_token: 'fake-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: now + 3600,
    user: {
      id: '11111111-1111-1111-1111-111111111111',
      aud: 'authenticated',
      role: 'authenticated',
      email: 'teste@example.com',
      user_metadata: { full_name: 'Usuária Teste' },
      app_metadata: {},
      created_at: new Date().toISOString(),
    },
  };
}

test('client Supabase conecta e sanity check de feed_content roda sem quebrar o app, mesmo vazio', async ({ page }) => {
  await page.route('**/rest/v1/feed_content**', (route) => {
    expect(route.request().method()).toBe('GET');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
  });

  await page.route('**/rest/v1/profiles**', (route) => {
    const method = route.request().method();
    if (method === 'GET') {
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else if (method === 'POST') {
      route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    } else {
      route.continue();
    }
  });

  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session));
    },
    { key: STORAGE_KEY, session: fakeSession() }
  );

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));

  const consoleLogs = [];
  page.on('console', (msg) => consoleLogs.push(msg.text()));

  const sanityLogPromise = page.waitForEvent('console', {
    predicate: (msg) => msg.text().includes('[supabase] feed_content OK'),
    timeout: 10000,
  });

  await page.goto('/');

  // app existente carrega e renderiza normalmente (com sessão mockada)
  await expect(page.locator('.header h1')).toBeVisible();

  const sanityMsg = await sanityLogPromise;
  expect(sanityMsg.text()).toContain('[supabase] feed_content OK');
  expect(sanityMsg.text()).toContain('0 itens ativos');

  // nenhum erro não tratado na página (createClient + query não quebraram nada)
  expect(pageErrors).toEqual([]);
  expect(consoleLogs.some((t) => t.includes('sanity check falhou'))).toBe(false);
  expect(consoleLogs.some((t) => t.includes('sanity check erro inesperado'))).toBe(false);
});

// @ts-check
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

// Onda 9 — persistência do "Comi hoje" (daily_log) + aba Histórico.
// Mesma estratégia do auth.spec.js: sessão simulada via localStorage e TODA
// chamada REST/Auth interceptada — nada toca o projeto Supabase real.

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

// mesma lógica de data local usada no app
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// data claramente no passado (nem hoje, nem ontem) para exercer o rótulo DD/MM
function daysAgoISO(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return { iso: `${y}-${m}-${day}`, ddmm: `${day}/${m}` };
}
const HIST_DAY = daysAgoISO(10);
const HIST_ROW = {
  log_date: HIST_DAY.iso,
  items: [{ id: 'banana', name: 'banana', prep: 0, qty: 1 }],
  score: { pct: 72, nota: 'muito bom', groupsCovered: 3, groupsMissing: ['gordura boa', 'hidratação'], itemCount: 1 },
};

async function mockCommon(page) {
  await page.route('**/rest/v1/feed_content**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
  });
  await page.route('**/rest/v1/profiles**', (route) => {
    const method = route.request().method();
    if (method === 'GET') route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    else if (method === 'POST') route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    else route.continue();
  });
  // getUser() valida o token contra /auth/v1/user
  await page.route('**/auth/v1/user**', (route) => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_USER) });
  });
}

async function loginAndGoto(page) {
  await page.addInitScript(
    ({ key, session }) => { localStorage.setItem(key, JSON.stringify(session)); },
    { key: STORAGE_KEY, session: fakeSession() }
  );
  await page.goto('/');
  await expect(page.locator('#app')).toBeVisible();
}

test('marcar 2 itens no "Comi hoje" dispara upsert em daily_log com os dados certos', async ({ page }) => {
  await mockCommon(page);

  /** @type {any[]} */
  const upsertBodies = [];
  /** @type {{url:string, prefer:string}[]} */
  const upsertReqs = [];

  await page.route('**/rest/v1/daily_log**', (route) => {
    const req = route.request();
    const method = req.method();
    if (method === 'GET') {
      // carga do dia de hoje -> vazio (nada pré-preenchido)
      route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    } else if (method === 'POST') {
      upsertBodies.push(req.postDataJSON());
      upsertReqs.push({ url: req.url(), prefer: req.headers()['prefer'] || '' });
      route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    } else {
      route.continue();
    }
  });

  await loginAndGoto(page);

  // aguarda a carga inicial do dia terminar (habilita o auto-save)
  await page.waitForFunction(() => window.__dailyLogReady === true);

  // vai para "Comi hoje" e marca 2 alimentos
  await page.locator('#tabHoje').click();
  await page.locator('.food-item').first().waitFor();
  await page.locator('.food-item').nth(0).click();
  await page.locator('.food-item').nth(1).click();

  // espera o upsert (debounce de 1200ms)
  await expect.poll(() => upsertBodies.length, { timeout: 5000 }).toBeGreaterThan(0);

  // supabase-js pode enviar objeto único ou array — normaliza
  const raw = upsertBodies[upsertBodies.length - 1];
  const body = Array.isArray(raw) ? raw[0] : raw;

  expect(body.user_id).toBe(FAKE_USER.id);
  expect(body.log_date).toBe(todayISO());
  expect(Array.isArray(body.items)).toBe(true);
  expect(body.items.length).toBe(2);
  expect(body.score).toBeTruthy();
  expect(typeof body.score.pct).toBe('number');

  // upsert com onConflict user_id,log_date
  const lastReq = upsertReqs[upsertReqs.length - 1];
  expect(lastReq.url).toContain('on_conflict=user_id');
  expect(lastReq.prefer).toContain('merge-duplicates');
});

test('aba Histórico aparece e lista os dias com registro', async ({ page }) => {
  await mockCommon(page);

  await page.route('**/rest/v1/daily_log**', (route) => {
    const req = route.request();
    const method = req.method();
    const url = req.url();
    if (method === 'GET') {
      if (url.includes('order=')) {
        route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([HIST_ROW]) });
      } else {
        route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
      }
    } else if (method === 'POST') {
      route.fulfill({ status: 201, contentType: 'application/json', body: '[]' });
    } else {
      route.continue();
    }
  });

  await loginAndGoto(page);

  // a 5ª aba existe e está visível
  await expect(page.locator('#tabHist')).toBeVisible();
  await expect(page.locator('#tabHist')).toHaveText(/Histórico/);

  await page.locator('#tabHist').click();

  // card do dia com registro
  const card = page.locator('.hist-card');
  await expect(card).toHaveCount(1);
  await expect(card).toContainText(HIST_DAY.ddmm);
  await expect(card).toContainText('72%');
  await expect(card).toContainText('3/5 grupos');

  // clicar expande e mostra os itens
  await expect(page.locator('#histDetail0')).toBeHidden();
  await card.click();
  await expect(page.locator('#histDetail0')).toBeVisible();
  await expect(page.locator('#histDetail0')).toContainText('banana');
});

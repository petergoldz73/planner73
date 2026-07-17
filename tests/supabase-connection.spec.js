// @ts-check
const { test, expect } = require('@playwright/test');

// Onda 7 — fundação Supabase: só valida que o client conecta e a query em
// feed_content roda sem erro, mesmo com lista vazia. Não testa auth nem UX
// (isso vem em ondas futuras). Como SUPABASE_URL/ANON_KEY no index.html
// ainda são placeholders (o usuário preenche depois), interceptamos a
// chamada REST do PostgREST e respondemos com uma lista vazia — o que basta
// pra provar que createClient() não quebra e que a leitura de feed_content
// é tratada com segurança quando não há conteúdo.

test('client Supabase conecta e sanity check de feed_content roda sem quebrar o app, mesmo vazio', async ({ page }) => {
  await page.route('**/rest/v1/feed_content**', (route) => {
    expect(route.request().method()).toBe('GET');
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: '[]',
    });
  });

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err));

  const consoleLogs = [];
  page.on('console', (msg) => consoleLogs.push(msg.text()));

  const sanityLogPromise = page.waitForEvent('console', {
    predicate: (msg) => msg.text().includes('[supabase] feed_content OK'),
    timeout: 10000,
  });

  await page.goto('/');

  // app existente carrega e renderiza normalmente
  await expect(page.locator('.header h1')).toBeVisible();

  const sanityMsg = await sanityLogPromise;
  expect(sanityMsg.text()).toContain('[supabase] feed_content OK');
  expect(sanityMsg.text()).toContain('0 itens ativos');

  // nenhum erro não tratado na página (createClient + query não quebraram nada)
  expect(pageErrors).toEqual([]);
  expect(consoleLogs.some((t) => t.includes('sanity check falhou'))).toBe(false);
  expect(consoleLogs.some((t) => t.includes('sanity check erro inesperado'))).toBe(false);
});

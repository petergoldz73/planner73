# NutriPlanner (GoodPlanner)

App voltado a corredores para entender o impacto do que comem em cinco
pilares fisiológicos relevantes pra performance e recuperação — não é uma
calculadora de calorias genérica, é focada em saúde cardiovascular, energia
aeróbica, inflamação e sono. A tela de login usa a marca "GoodPlanner"; o
`<title>` e os textos internos ainda dizem "NutriPlanner".

## Stack

- **Frontend**: página única (`index.html`), sem build step e sem framework.
  CSS inline no `<head>`, marcação mínima no `<body>`, lógica em dois
  `<script>` no fim do arquivo (um clássico com toda a lógica do app, um
  `type="module"` com a integração Supabase). Fontes via Google Fonts
  (`Space Mono` / `Space Grotesk`), PDF via jsPDF (CDN,
  `cdnjs.cloudflare.com/.../jspdf`).
- **Backend**: Supabase (projeto `pohhiusipkqcnzrcwiar`), usado para:
  - **Auth** — login obrigatório via Google OAuth (`supabaseClient.auth.signInWithOAuth`).
    Não há modo deslogado nem convidado: sem sessão, só a tela de login
    aparece (`#loginScreen`).
  - **Postgres com RLS** — tabelas `profiles` (perfil criado automaticamente
    no primeiro login via `ensureProfile()`), `daily_log` (persistência do
    "Comi hoje" dia a dia) e `feed_content` (conteúdo do feed da aba
    Início, com leitura pública e escrita restrita à service_role — o app
    nunca escreve nela). Schema e policies em `supabase_setup.sql`;
    `supabase_daily_log_rls.sql` é um reforço idempotente específico das
    policies de insert/update de `daily_log`.
  - As credenciais (`SUPABASE_URL`/`SUPABASE_ANON_KEY`) estão hardcoded no
    `<script type="module">` do `index.html` — são a anon key pública, não
    um segredo de servidor.
- **Hospedagem**: GitHub Pages. O `redirectTo` do OAuth usa
  `window.location.origin + window.location.pathname` (ajustado para
  funcionar no path do Pages, não só em localhost).
- **Testes**: Playwright (`tests/`), servidos por um servidor estático
  próprio (`tests/static-server.js`, porta 4173) porque o `import` de
  módulo ES do supabase-js exige `http(s)://`, não `file://`. Os specs
  mockam as chamadas REST do Supabase (login, feed, daily_log) — não tocam
  o projeto real. `npm test` roda a suíte.

### ⚠️ Risco operacional: projeto Supabase no plano Free

O login com Google **depende do projeto Supabase estar ativo**. No plano
Free, o Supabase **pausa o projeto após um período de inatividade**. Se o
projeto estiver pausado, `signInWithOAuth`/`getSession` falham e o usuário
fica travado na tela de login (sem fallback de modo deslogado). Se o login
parar de funcionar em produção, a primeira coisa a checar é o status do
projeto no painel Supabase (`pohhiusipkqcnzrcwiar`) antes de suspeitar de
bug no código.

## Histórico de ondas (concluídas)

1. **Onda 1** — estrutura inicial do app: base de alimentos (`FOODS`),
   sistema de score por pontuação ponderada, montador de suco, abas
   "Comi hoje"/"Planejar".
2. **Onda 2** — documentação do projeto e landing page de referência
   (`NutriPlanner Landing.dc.html`) usada como fonte da identidade visual.
3. **Onda 3** — identidade visual da landing aplicada ao `index.html`
   (paleta `oklch` com terracota/verde/azul/âmbar/teal/roxo/laranja/vermelho,
   tipografia Space Mono/Space Grotesk, visual "cards" quadrados).
4. **Onda 4** — motor de cálculo do plano de corrida (aba "Prova"):
   classificação de distância/pace/intensidade e montagem da linha do
   tempo de fases até a prova.
5. **Onda 5** — geração de cardápio por refeição dentro de cada fase, com
   variação determinística (seed) e extras de suplementação/timing.
6. **Onda 6** — interface visual completa da aba Prova: substituição de
   alimentos por outros do mesmo papel, exportação em PDF
   (`exportProvaPDF`), e botão para jogar o cardápio de um dia como
   selecionado em "Comi hoje" (`usarDiaComiHoje`).
7. **Onda 7** — fundação Supabase: cliente (`supabaseClient`), schema +
   RLS (`supabase_setup.sql`: `profiles`, `daily_log`, `feed_content`),
   suíte Playwright inicial.
8. **Onda 8** — login obrigatório com Google via Supabase Auth, tela de
   login com a marca "GoodPlanner", criação automática de `profiles` no
   primeiro acesso, e fix do `redirectTo` para funcionar no GitHub Pages
   (não só localhost).
9. **Onda 9** — histórico na nuvem: salvamento automático (debounced) do
   "Comi hoje" em `daily_log` (`saveDailyLogNow`/`scheduleDailyLogSave`),
   carga do dia ao abrir o app (`loadTodayLog`), e nova aba "Histórico"
   mostrando os últimos 30 dias registrados (`loadHistory`/`renderHistory`).

## Estrutura do index.html

- **`FOODS` (array de objetos)** — base de dados de alimentos. Cada item tem
  `id`, `name`, `cat` (categoria), `unit`/`ref` (unidade e porção de
  referência, ex. `g`/100), pontuação geral (`pts`) e a pontuação em cada um
  dos 5 pilares (`cardio`, `energia`, `anti`, `sono`, `inflam`). Alimentos
  ruins têm `neg:true` e `pts` negativo. Alguns têm `preps` (variações de
  preparo, ex. "grelhado" vs "frito") que ajustam os valores via deltas.

- **Montador de suco (`JUICE_ING`, `JUICE_BASE`, `JUICE_SWEET` +
  `renderJuiceBuilder()`)** — categoria especial `'suco (montar)'` onde o
  usuário escolhe ingredientes, base (água/água de coco) e adoçante. O suco
  montado vira uma entrada em `customJuices`, com valores calculados como
  média dos ingredientes + modificadores de base/adoçante, e passa a
  funcionar como qualquer outro alimento selecionável.

- **Feed da aba Início (`FEED_CARDS`, `renderFeed()`)** — cartões de dica
  rápida/curiosidade/combinação/timing, selecionados e embaralhados de
  forma determinística por dia (`seededRandom`/`todaySeed`), pra dar
  variedade sem precisar de backend pro conteúdo em si (hoje estático no
  array; `feed_content` no Supabase existe como destino futuro, mas o app
  ainda lê do array local).

- **Sistema de abas (`setMode()`)** — cinco abas: "Início" (`mode='inicio'`,
  feed de dicas + CTA), "Comi hoje" (`mode='hoje'`, avaliar retroativamente
  o que já foi comido, com auto-save em `daily_log`), "Planejar"
  (`mode='amanha'`, montar o cardápio do dia seguinte, com exportação de
  PDF), "Prova" (`mode='prova'`, plano nutricional pra uma corrida
  específica) e "Histórico" (`mode='hist'`, últimos 30 dias salvos na
  nuvem).

- **Sistema de score (`calcScore()`, `effective()`, `qtyWeight()`,
  `groupsInfo()`)** — ver seção dedicada abaixo.

- **Motor da aba Prova (`calcRacePlan()` e funções auxiliares)** — ver
  seção dedicada abaixo.

- **Exportação de PDF (`exportPDF()` para o dia planejado,
  `exportProvaPDF()` para o plano de corrida)** — usa jsPDF (CDN). Tem
  fallback em cascata: se o jsPDF não carregar ou `doc.save()` falhar, cai
  para `copyResumo()` (clipboard) e, se isso também falhar, exibe o texto em
  um modal (`showTextModal()`) pra cópia manual.

- **Persistência Supabase (`saveDailyLogNow`, `loadTodayLog`,
  `loadHistory`, `ensureProfile`)** — ver seção de Stack acima.

## Os 5 pilares

Cada alimento pontua de 0 a 10 em cada pilar:

1. **Saúde cardíaca** (`cardio`) — vasodilatadores, ômega 3, nitratos.
2. **Energia aeróbica** (`energia`) — qualidade e disponibilidade de
   carboidrato/glicogênio.
3. **Antioxidante** (`anti`) — combate a estresse oxidativo do treino.
4. **Anti-inflamatório** (`inflam`) — perfil pró ou anti-inflamatório do
   alimento/preparo.
5. **Qualidade do sono** (`sono`) — triptofano, magnésio, melatonina natural,
   cafeína (negativo).

O resultado (`openResult()`) mostra cada pilar como card individual, além de
gaps/alertas gerados por `detectGaps()` e combinações sinérgicas por
`detectCombos()` (ex. sardinha + espinafre para absorção de ferro).

## Como o score funciona hoje

`calcScore()` combina dois componentes, não só a média de qualidade:

- **Qualidade (`qualidade`, peso 35%)** — média ponderada de `pts` entre os
  itens selecionados, com peso (`qtyWeight()`) dado pela proporção da
  quantidade escolhida em relação à porção de referência do alimento
  (saturando entre 0.4x e 2x), normalizada de -10..+10 para 0..100%.
- **Completude (`completude`, peso 65%, calculada em `groupsInfo()`)** —
  cobertura de 5 grupos essenciais do dia (proteína, carboidrato,
  vegetal/fruta, hidratação, gordura boa), 20 pontos por grupo coberto,
  multiplicado por um fator de quantidade de itens
  (`Math.min(1, sel.length/4)`) que penaliza dias com poucos itens mesmo
  que cubram algum grupo.

O percentual final (`pct`) é `qualidade*0.35 + completude*0.65`. Isso
resolveu o caso antigo "uma banana sozinha = ~90%": hoje um único item,
mesmo de ótima qualidade, nunca enche a completude (poucos itens e poucos
grupos cobertos), então o score final fica baixo. `detectGaps()` ainda
complementa com avisos textuais (grupos faltando, ausência de hidratação
etc.), mas agora o **número da nota em si** já reflete adequação, não só
qualidade média — isso fechou o roadmap de reforma do score (ver histórico
de ondas).

## Motor da aba Prova (plano de corrida)

`calcRacePlan(distanceKm, paceMinKm, raceDateStr, weightKg)` é o ponto de
entrada, chamado por `calcularProva()` a partir do formulário da aba
"Prova". Fluxo:

1. **Classificação da prova** — `classifyDistancia()` (curta/média/
   longa/ultra) e `classifyPace()` (tranquilo/moderado/forte/muitoForte)
   combinam em `classifyIntensidade()` numa escala leve → moderada →
   exigente → muito exigente (soma ponderada não-linear: pace "forte"
   pesa desproporcionalmente mais que um degrau, ver comentário no código).
2. **Níveis de necessidade (`niveis`)** — a partir do índice de
   intensidade e do peso corporal (`weightFactor`), calcula nível
   baixo/médio/alto de carboidrato, proteína, hidratação,
   anti-inflamatório e sono (`nivel()`).
3. **Linha do tempo de fases (`buildFasesTimeline()`)** — a partir da
   data da prova, classifica cada dia (`classifyOffset()`) em: prova
   (dia 0), véspera (dia 1), abastecimento/carbo-loading (dias 2-3),
   construção e base (dias mais distantes, proporcional ao total restante).
   Os ~7 dias mais próximos da prova aparecem individualmente; dias mais
   distantes são agrupados em blocos por fase (data-range) pra não gerar
   uma lista enorme.
4. **Cardápio por dia (`buildCardapioDia()`)** — monta café/almoço/jantar/
   lanches por papel (`MEAL_POOLS`, ex. `cafeCarbo`, `almocoProteina`),
   escolhendo um alimento do pool com rotação determinística por dia
   (`rotatePick()`, seedada por papel, garante que dias vizinhos quase
   sempre caem em itens diferentes e o ciclo só repete depois de passar
   por todo o pool). Fases "prova" e "véspera" têm cardápio fixo e
   simplificado (sem variação) por segurança (nada novo perto da prova).
   `buildExtras()` adiciona suplementação/timing fora das refeições
   (beterraba/cafeína pré-prova, eletrólitos no carbo-loading, magnésio/
   ômega 3 conforme os níveis).
5. **Interação do usuário** — `trocarAlimento()` troca um item por outro
   do mesmo papel (dropdown `poolOptionsHtml()`); `usarDiaComiHoje()`
   joga os itens de um dia do plano como selecionados na aba "Comi hoje"
   (substituindo o que já estava marcado, com confirmação);
   `exportProvaPDF()` gera o PDF do plano completo via jsPDF.

## Roadmap

Os dois itens que estavam pendentes (reforma do score de qualidade→
adequação, e identidade visual da landing) **já foram concluídos** nas
Ondas 3 e 9 — ver seções acima. Não há item de roadmap em aberto registrado
no momento; próximos passos devem ser definidos com o usuário antes de
qualquer mudança de código.

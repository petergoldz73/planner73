# NutriPlanner

App de página única (`index.html`, sem build step, sem dependências além do
jsPDF via CDN) para planejamento nutricional voltado a corredores. A proposta
é ajudar quem treina corrida a entender o impacto do que come em cinco
pilares fisiológicos relevantes pra performance e recuperação — não é uma
calculadora de calorias genérica, é focada em saúde cardiovascular, energia
aeróbica, inflamação e sono.

Tudo vive em um único arquivo HTML: CSS inline no `<head>`, marcação mínima
no `<body>`, e toda a lógica em um `<script>` no fim do arquivo. Não há
backend — o estado vive em variáveis JS na sessão (nada é persistido).

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

- **Sistema de abas (`setMode()`)** — duas abas, "Comi hoje" (`mode='hoje'`,
  avaliar retroativamente o que já foi comido) e "Planejar" (`mode='amanha'`,
  montar o cardápio do dia seguinte). O modo muda textos de UI (banner,
  título do botão principal, título do resultado) e habilita a exportação de
  PDF apenas no modo "Planejar".

- **Sistema de score (`calcScore()`, `effective()`, `qtyWeight()`)** — ver
  seção dedicada abaixo.

- **Exportação de PDF (`exportPDF()`)** — usa jsPDF (carregado via CDN,
  `cdnjs.cloudflare.com/.../jspdf`) para gerar um PDF com nota geral,
  pilares, lista de alimentos e veredito. Só aparece no modo "Planejar". Tem
  fallback em cascata: se o jsPDF não carregar ou `doc.save()` falhar, cai
  para `copyResumo()` (clipboard) e, se isso também falhar, exibe o texto em
  um modal (`showTextModal()`) pra cópia manual.

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

## Como o score funciona hoje (e o problema conhecido)

`calcScore()` calcula uma **média ponderada** de `pts` (e de cada pilar)
entre todos os itens selecionados no dia, com peso (`qtyWeight()`) dado pela
proporção da quantidade escolhida em relação à porção de referência do
alimento (saturando entre 0.4x e 2x). O percentual final é essa média
normalizada de -10..+10 para 0..100%.

**Problema conhecido:** o score mede *qualidade média* do que foi
selecionado, não *adequação/completude* do dia. Ele não sabe se o conjunto
selecionado cobre as necessidades do dia inteiro — só sabe se, em média, os
itens escolhidos são "bons" ou "ruins". Isso permite resultados absurdos:
selecionar **só uma banana** (pts alto, ~8) já dá algo em torno de **90%**,
mesmo sendo claramente insuficiente como alimentação de um dia inteiro. Os
gaps (`detectGaps()`) tentam compensar isso textualmente (avisando sobre
ausência de proteína, vegetais, hidratação etc.), mas o **número da nota em
si** não reflete completude — só reflete a média de qualidade dos itens
escolhidos, poucos ou muitos.

## Roadmap

1. **Reformar o score para medir adequação, não só qualidade média.** A nota
   precisa refletir se o dia como um todo atende às necessidades nutricionais
   (variedade de grupos, cobertura mínima de proteína/carboidrato/vegetais/
   hidratação, quantidade absoluta — não só a qualidade média dos itens
   marcados), corrigindo o caso "uma banana = 90%".
2. **Aplicar identidade visual da landing.** Hoje o app usa um tema dark
   genérico definido inline no `<style>` (`--bg`, `--green`, `--blue` etc.).
   Trocar essas variáveis/paleta pela identidade visual usada na landing page
   do produto, mantendo a estrutura de componentes existente.

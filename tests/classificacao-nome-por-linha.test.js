/* A CLASSIFICAÇÃO DO LETZPLAY MOSTRA O NOME DE CADA LINHA — nunca o da linha de cima.
 *
 * O QUE ESTE TESTE EXISTE PRA IMPEDIR (relato do dono, 16/ago/2026, com print): a
 * classificação do ranking "Social Masc D+ / C-" saiu com "Fabio Ruggiero Inativo" em
 * TODAS as 6 posições, e a do "BT SOCIAL - Cat Masculina D" com "—" no 1º e "AR" nos
 * demais. Os handles, esses, sempre estiveram certos em toda linha.
 *
 * As três causas, medidas na página real (letzplay.me/paineiras-bt/rankings/48552):
 *
 *   1. `var players` era declarado UMA vez e só reatribuído quando a linha tinha
 *      `.break-line` — que só existe em quem tem o badge Inativo. `var` é escopado à
 *      FUNÇÃO, então nas linhas seguintes o valor da linha ANTERIOR sobrevivia, o teste
 *      `!players.length` dava falso, o fallback não rodava e o nome vazava para baixo.
 *
 *   2. o nome real mora num `<a class="btn-link-default">`; o `a[href^="/"]` que o
 *      extrator lia é o link do AVATAR — uma <img> (texto vazio → "—") ou as INICIAIS
 *      num <span> (→ "AR").
 *
 *   3. o badge Ativo/Inativo é um `<span class="label">` IRMÃO do nome, SEM <br> entre
 *      eles: tirar as tags juntava tudo numa string só ("Fabio Ruggiero Inativo"), e o
 *      filtro /^(Inativo|Ativo)$/ — que exige a string INTEIRA — nunca casava.
 *
 * E um quarto defeito, de outra natureza: a competição fantasma "U · Feed". O regex
 * `^/([^/]+)/rankings/(\d+)` aceitava QUALQUER primeiro segmento como clube, inclusive
 * `/u/` (a área do usuário logado). Nascia `r/u/48552` — mesmo id de um ranking real, mas
 * clube errado, ou seja uma SEGUNDA entrada, que nunca resolve nada (`/u/rankings/48552`
 * redireciona pra home) e aparece sem classificação e com 0 V/0 D.
 *
 * Cobre os DOIS lados, porque cada um sozinho deixa metade do estrago de pé:
 *   • ESCRITA (extensão): o extrator real rodando num Chromium contra o markup real;
 *   • LEITURA (app): a cura de quem JÁ tem o dado errado gravado — sem essa metade, o
 *     dono continuaria vendo o nome de outra pessoa até reimportar.
 *
 * Roda com: node tests/classificacao-nome-por-linha.test.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let falhas = 0, testes = 0;
function ok(cond, msg) {
  testes++;
  if (cond) { console.log('  ✓ ' + msg); }
  else { falhas++; console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (obtido: ' + JSON.stringify(a) + ')'); }

/* ── markup REAL, copiado da página do letzplay em 16/ago/2026 ─────────────────────── */
function linha(pos, handle, nome, opts) {
  opts = opts || {};
  // avatar: quem tem foto rende <img> (texto vazio); quem não tem rende as INICIAIS
  const avatar = opts.iniciais
    ? '<a href="/' + handle + '"><div class="avatar img-xs img-circle"><span>' + opts.iniciais + '</span></div></a>'
    : '<a href="/' + handle + '"><img class="img-xs img-circle" src="https://x/y.webp"></a>';
  // o badge Inativo acrescenta a classe break-line ao container do nome — e mais nada
  const badge = opts.inativo
    ? '<span class="text-overflow text-muted small"><small><span class="label small label-default"> Inativo </span></small></span>'
    : '';
  return '<div class="row">' +
    '<div class="colocation">' + pos + '</div>' +
    '<div class="col-xs-2 table-field avatar">' + avatar + '</div>' +
    '<div class="col-xs-10 table-field ' + (opts.inativo ? 'break-line' : '') + '">' +
      '<span class="text-overflow"><a onclick="modalUserSignin();" class="btn-link-default" href="#/">' + nome + '</a></span>' +
      badge +
    '</div>' +
    '<div class="points">' + (opts.pts != null ? opts.pts : 0) + '</div>' +
  '</div>';
}

// O caso EXATO do print: a 1ª linha com badge (tem break-line), as demais sem.
const HTML_INATIVO_NO_TOPO =
  '<div class="table-ranking">' +
    '<div class="row"><div class="col">Pos</div></div>' +   // cabeçalho, sem link
    linha(1, 'FabioRuggiero2',    'Fabio Ruggiero',    { inativo: true, iniciais: 'FR', pts: 1069 }) +
    linha(2, 'msmano',            'Max Mano',          { pts: 1053 }) +
    linha(3, 'MarceloBemelmans1', 'Marcelo Bemelmans', { pts: 940 }) +
    linha(4, 'ClaudioGuimaraes1', 'Claudio Guimaraes', { pts: 889 }) +
    linha(5, 'RodrigoBarth',      'Rodrigo Barth',     { pts: 842 }) +
  '</div>';

// O outro caso do print: ninguém com badge, avatares com INICIAIS ("AR").
const HTML_SEM_BADGE =
  '<div class="table-ranking">' +
    linha(1, 'HenriqueTanaka2', 'Henrique Tanaka', { pts: 2944 }) +
    linha(2, 'AriRabello',      'Ari Rabello',     { iniciais: 'AR', pts: 2586 }) +
    linha(3, 'RodrigoBarth',    'Rodrigo Barth',   { iniciais: 'AR', pts: 2402 }) +
    linha(4, 'DouglasLeonardo', 'Douglas Leonardo',{ iniciais: 'AR', pts: 2163 }) +
  '</div>';

/* ── LADO DA ESCRITA: o extrator REAL da extensão, num Chromium ────────────────────── */
async function ladoEscrita(browser) {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');

  // Extrai as duas funções REAIS do content.js — casamento de assinatura, nunca réplica:
  // uma cópia aqui ficaria verde com o arquivo revertido.
  const src = read('extension/content.js');
  const iniH = src.indexOf('  function _nomesDaLinha(row, linkAvatar) {');
  const iniF = src.indexOf('  function rankingStandingsFromDoc(doc) {');
  const fimF = src.indexOf('\n  }\n', src.indexOf("return rows.length ? [{ group: 'Classificação', ranking: true, rows: rows }] : null;", iniF)) + 4;
  ok(iniH > 0, 'ESCRITA · _nomesDaLinha existe no content.js (o nome não sai mais do link do avatar)');
  ok(iniF > 0 && fimF > iniF, 'ESCRITA · rankingStandingsFromDoc extraída do arquivo real');
  // Começa no MENOR dos dois: sem o helper (código antigo), extrai só a função — o teste
  // tem que acusar as falhas de COMPORTAMENTO, não estourar por falta de um símbolo.
  const codigo = src.slice(iniH > 0 ? Math.min(iniH, iniF) : iniF, fimF);

  ok(/var players = _nomesDaLinha\(row, link\);/.test(codigo),
     'ESCRITA · `players` é declarado DENTRO do laço, a cada linha (o vazamento do `var`)');

  await page.evaluate((c) => { eval(c); window.__ext = rankingStandingsFromDoc; }, codigo);

  for (const [rotulo, html, esperado] of [
    ['inativo no topo', HTML_INATIVO_NO_TOPO,
      ['Fabio Ruggiero', 'Max Mano', 'Marcelo Bemelmans', 'Claudio Guimaraes', 'Rodrigo Barth']],
    ['sem badge, avatar com iniciais', HTML_SEM_BADGE,
      ['Henrique Tanaka', 'Ari Rabello', 'Rodrigo Barth', 'Douglas Leonardo']],
  ]) {
    const st = await page.evaluate((h) => {
      const doc = new DOMParser().parseFromString(h, 'text/html');
      return window.__ext(doc);
    }, html);
    const rows = (st && st[0] && st[0].rows) || [];
    eq(rows.map(r => r.players.join(' / ')), esperado, 'ESCRITA · ' + rotulo + ': cada linha com o SEU nome');
    ok(new Set(rows.map(r => r.players.join('/'))).size === rows.length,
       'ESCRITA · ' + rotulo + ': nenhum nome se repete entre linhas');
    ok(!rows.some(r => /\b(Inativo|Ativo)\b/i.test(r.players.join(' '))),
       'ESCRITA · ' + rotulo + ': o badge não entra colado no nome');
    ok(!rows.some(r => !r.players.length),
       'ESCRITA · ' + rotulo + ': nenhuma linha sai sem nome (o "—" do print)');
    ok(!rows.some(r => r.players.some(n => /^[A-Z]{2}$/.test(n))),
       'ESCRITA · ' + rotulo + ': iniciais do avatar nunca viram nome ("AR")');
    ok(rows.every((r, i) => r.handles.length && r.handles[0] === [
      ...HTML_INATIVO_NO_TOPO === html
        ? ['FabioRuggiero2','msmano','MarceloBemelmans1','ClaudioGuimaraes1','RodrigoBarth']
        : ['HenriqueTanaka2','AriRabello','RodrigoBarth','DouglasLeonardo']][i]),
       'ESCRITA · ' + rotulo + ': o handle continua sendo o da própria linha');
  }

  // o badge sai do ELEMENTO, não de regex no texto da linha inteira
  const stInat = await page.evaluate((h) => {
    const doc = new DOMParser().parseFromString(h, 'text/html');
    return window.__ext(doc);
  }, HTML_INATIVO_NO_TOPO);
  eq(stInat[0].rows.map(r => !!r.inactive), [true, false, false, false, false],
     'ESCRITA · só quem TEM o badge é marcado inativo');

  await page.close();
}

/* ── LADO DA LEITURA: cura do que já está gravado ──────────────────────────────────── */
function ladoLeitura() {
  const src = read('js/views/letzplay-profile.js');
  const ini = src.indexOf('  function lpCuraNomes(rows) {');
  const fim = src.indexOf('\n  }\n', ini) + 4;
  ok(ini > 0, 'LEITURA · lpCuraNomes existe (cura sem reimportar e sem escrever no banco)');
  const sandbox = { root: {}, window: {} };
  // eslint-disable-next-line no-new-func
  new Function('root', 'window', src.slice(ini, fim) + '\nreturn lpCuraNomes;')(sandbox.root, sandbox.window);
  const cura = new Function('root', 'window', src.slice(ini, fim) + '\nreturn lpCuraNomes;')({}, {});

  // O dado REAL gravado no doc do dono (letzplayScans/B17n…, lido em 16/ago/2026).
  const gravado = [
    { pos: 1, players: ['Fabio Ruggiero Inativo'], handles: ['FabioRuggiero2'],    points: 1069 },
    { pos: 2, players: ['Fabio Ruggiero Inativo'], handles: ['msmano'],            points: 926 },
    { pos: 3, players: ['Fabio Ruggiero Inativo'], handles: ['MarceloBemelmans1'], points: 861 },
    { pos: 6, players: ['Fabio Ruggiero Inativo'], handles: ['RodrigoBarth'],      points: 765 },
  ];
  const curado = cura(gravado);
  ok(!curado.some(r => r.players.join(' ') === 'Fabio Ruggiero Inativo'),
     'LEITURA · o nome vazado não sobrevive à leitura');
  eq(curado.map(r => r.players.join('/')),
     ['FabioRuggiero2', 'msmano', 'MarceloBemelmans1', 'RodrigoBarth'],
     'LEITURA · rótulo repetido cai para o HANDLE, que é a identidade correta da linha');

  // o outro caso: nome vazio e iniciais
  const gravado2 = [
    { pos: 1, players: [],     handles: ['HenriqueTanaka2'], points: 2944 },
    { pos: 2, players: ['AR'], handles: ['AriRabello'],      points: 2586 },
    { pos: 3, players: ['AR'], handles: ['RodrigoBarth'],    points: 2402 },
  ];
  eq(cura(gravado2).map(r => r.players.join('/')),
     ['HenriqueTanaka2', 'AriRabello', 'RodrigoBarth'],
     'LEITURA · linha sem nome e iniciais repetidas caem para o handle');

  // ⚠️ o que NÃO pode ser tocado: classificação boa passa intacta
  const boa = [
    { pos: 1, players: ['Fabio Ruggiero'],    handles: ['FabioRuggiero2'], points: 1069, inactive: true },
    { pos: 2, players: ['Max Mano'],          handles: ['msmano'],         points: 1053 },
    { pos: 3, players: ['Ana / Bia'],         handles: ['ana', 'bia'],     points: 900 },
  ];
  eq(cura(boa).map(r => r.players.join('/')), ['Fabio Ruggiero', 'Max Mano', 'Ana / Bia'],
     'LEITURA · classificação correta passa INTACTA (a cura não inventa handle onde há nome)');
  ok(cura(boa)[0].inactive === true, 'LEITURA · a cura preserva o marcador de inativo');
  ok(cura(boa)[0].points === 1069 && cura(boa)[0].pos === 1, 'LEITURA · a cura preserva posição e pontos');

  // homônimo LEGÍTIMO: duas pessoas com o mesmo nome existem, e o handle desempata —
  // cair para o handle aqui é o comportamento certo, não um dano.
  const homonimos = [
    { pos: 1, players: ['João Silva'], handles: ['JoaoSilva1'], points: 10 },
    { pos: 2, players: ['João Silva'], handles: ['JoaoSilva2'], points: 8 },
  ];
  eq(cura(homonimos).map(r => r.players.join('/')), ['JoaoSilva1', 'JoaoSilva2'],
     'LEITURA · homônimos ficam distinguíveis (handle), nunca duas linhas idênticas');

  // sufixo do badge some mesmo quando o nome é único
  eq(cura([{ pos: 1, players: ['Guilherme Lutz Inativo'], handles: ['GuilhermeLutz'] }])[0].players,
     ['Guilherme Lutz'], 'LEITURA · o sufixo do badge é removido do nome');
}

/* ── A competição fantasma "U · Feed" ──────────────────────────────────────────────── */
function fantasma() {
  const store = read('js/store.js');
  ok(/window\._lzClubeValido\s*=/.test(store),
     'FANTASMA · a regra de clube válido é FONTE ÚNICA no store.js');
  const cv = new Function('window', store.slice(store.indexOf('window._LZ_CLUBE_RESERVADO'),
    store.indexOf('};', store.indexOf('window._lzClubeValido')) + 2) + '\nreturn window._lzClubeValido;')({});
  ok(cv({ club: 'paineiras-bt' }) === true, 'FANTASMA · clube de verdade continua valendo');
  ok(cv({ club: 'u' }) === false, 'FANTASMA · `/u/` (área do usuário logado) não é clube');
  ok(cv({ club: 'U' }) === false, 'FANTASMA · a rejeição não depende de caixa');
  ok(cv({ club: 'home' }) === false && cv({ club: 'login' }) === false,
     'FANTASMA · outras rotas de sistema também são rejeitadas');

  // os DOIS consumidores filtram — um só deixaria a entrada aparecendo na outra tela
  const perfil = read('js/views/letzplay-profile.js');
  ok(/f\.official && lpClubeValido\(f\)/.test(perfil) && /!f\.official && lpClubeValido\(f\)/.test(perfil),
     'FANTASMA · a ficha do jogador filtra nas DUAS listas (torneios e rankings)');
  const analise = read('js/views/tournaments-enrollment-report.js');
  ok(/_lzClubeValido\(f\)\) return;/.test(analise),
     'FANTASMA · a Análise de Inscritos filtra pela MESMA regra');
  ok(!/_CLUBE_RESERVADO\s*=\s*\{/.test(perfil),
     'FANTASMA · a ficha não mantém uma segunda lista própria (duas listas divergem)');

  // e a extensão para de CRIAR a entrada
  const ext = read('extension/content.js');
  ok(/var _CLUBE_RESERVADO = \{/.test(ext), 'FANTASMA · a extensão tem o guard de escrita');
  ok(/if \(_CLUBE_RESERVADO\[String\(m\[1\]\)\.toLowerCase\(\)\]\) return;/.test(ext),
     'FANTASMA · o guard roda no colher() do lerLista, antes de virar competição');
}

/* ── O NOME DOS JOGADORES NO CARD DO JOGO ──────────────────────────────────────────── */
/* Terceiro defeito da MESMA família: `textContent` engolindo a estrutura do HTML. No card
 * os dois nomes vêm separados por <br>, na mesma ordem dos handles:
 *     `Marco Vasco <br> Ricardo Pettená`
 * O código colava tudo num texto só e tentava adivinhar onde cortar, casando palavra a
 * palavra contra o handle. A adivinhação erra sempre que o handle não é Nome+Sobrenome
 * consecutivos: `ArturDieguez` para "Artur Luíz C Diegues" casa só "Artur", e "Diegues"
 * VAZA para o parceiro — foi assim que saiu "Diegues Ricardo Pettená".
 * Medido: 299 nomes truncados nos 12 docs de leitura. */
async function nomesNosJogos(browser) {
  const src = read('extension/lib/letzplay-extract.js');
  ok(/partes\.length === handles\.length/.test(src),
     'JOGOS · os nomes são separados pelo <br>, casando com a ordem dos handles');
  ok(/Reserva: markup sem <br>/.test(src),
     'JOGOS · a adivinhação por palavra virou reserva, não o caminho principal');

  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: src });

  // markup REAL do card (letzplay.me/paineiras-bt/rankings/33695/matches, 16/ago/2026)
  const linha = (hs, nomes, venceu, games) =>
    '<div class="row match-player">' +
      '<div class="match-player-info">' + hs.map(h => '<a href="/' + h + '"><img src="x"></a>').join('') + '</div>' +
      '<span class="match-players-double"> ' + nomes.join(' <br> ') + ' </span>' +
      '<div class="match-results-points"><div class="col-xs-1 match-points ' +
        (venceu ? 'highlight' : 'no-highlight') + '">' + games + '</div></div>' +
    '</div>';
  const card =
    '<div class="row match"><div class="col-xs-12">' +
      '<a href="/paineiras-bt/rankings/33695">BT SOCIAL</a>' +
      '<div class="match-77-schedule">Terça, 30/09/25</div>' +
      linha(['RodrigoBarth', 'ArturDieguez'], ['Rodrigo Barth', 'Artur Luíz C Diegues'], true, 6) +
      linha(['RicardoPettena', 'JoaoScassa'], ['Ricardo Pettená', 'João Scassa'], false, 3) +
    '</div></div>';

  const g = await page.evaluate(([h]) => {
    const doc = new DOMParser().parseFromString('<html><body>' + h + '</body></html>', 'text/html');
    const r = window._spExtract.extractMatchesFromDoc(doc, 'RodrigoBarth');
    return r && r[0] ? { parceiro: r[0].partnerName, adversarios: r[0].oppNames } : null;
  }, [card]);

  eq(g && g.parceiro, 'Artur Luíz C Diegues',
     'JOGOS · nome com partícula do meio chega INTEIRO (era truncado em "Artur")');
  eq(g && g.adversarios, ['Ricardo Pettená', 'João Scassa'],
     'JOGOS · o resto do nome do parceiro não VAZA para o adversário');

  await page.close();
}

(async () => {
  console.log('\n═══ classificação: cada linha com o seu nome ═══\n');
  const browser = await chromium.launch();
  try {
    await ladoEscrita(browser);
    console.log('');
    ladoLeitura();
    console.log('');
    await nomesNosJogos(browser);
    console.log('');
    fantasma();
  } finally { await browser.close(); }
  console.log('\n' + (falhas ? '❌ ' + falhas + ' falha(s) de ' + testes : '✅ ' + testes + ' asserções, 0 falhas') + '\n');
  process.exit(falhas ? 1 : 0);
})();

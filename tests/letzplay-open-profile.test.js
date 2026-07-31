/* A página do letzplay abre NO CLIQUE — node tests/letzplay-open-profile.test.js
 * Relato do dono (30/jul/2026): "continua não abrindo a página do letzplay assim que
 * clica no buscar. isso tem que ser instantâneo". A navegação era ENFILEIRADA junto com
 * as buscas e esperava o passo aprendido da fila (medido: 10–25 s por operação).
 */
const fs = require('fs'), path = require('path');
const R = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const app = R('js/views/tournaments-enrollment-report.js');
const cnt = R('extension/content.js');
const bg = R('extension/background.js');

// 1) o app pede a abertura no clique, ANTES de qualquer validação que possa desistir
const i = app.indexOf("__sp_lp: 'lz-open-profile'");
ok(i > 0, 'o app dispara lz-open-profile');
ok(i < app.indexOf("Este inscrito não tem @ do letzplay"),
  'a abertura vem ANTES do caminho de erro — clicou, a página abre');

// 2) a extensão traduz pra uma navegação IMEDIATA
ok(/lz-open-profile[\s\S]{0,400}lp-nav-now/.test(cnt), 'content.js manda lp-nav-now');
ok(/'lp-nav-now'[\s\S]{0,300}navLetzplayTab/.test(bg), 'background.js navega direto');

// 3) e essa navegação NÃO passa pela fila de trabalho
const bloco = bg.slice(bg.indexOf("'lp-nav-now'"), bg.indexOf("'lp-nav-now'") + 400);
ok(!/enqueue\(/.test(bloco), 'lp-nav-now NÃO é enfileirado (era isso que travava)');
const blocoAntigo = bg.slice(bg.indexOf("msg.type === 'lp-nav'"), bg.indexOf("msg.type === 'lp-nav'") + 400);
ok(/enqueue\(/.test(blocoAntigo), 'o lp-nav de trabalho continua serializado (não vira rajada)');

// 4) a ETAPA 0 não enfileira navegação de novo
const etapa0 = cnt.slice(cnt.indexOf('ETAPA 0'), cnt.indexOf('ETAPA 1'));
ok(!/type: 'lp-nav'\s*,/.test(etapa0), 'ETAPA 0 não gasta um passo da fila navegando');

// 5) o piso da fila decai — senão um bloqueio antigo deixa tudo lento pra sempre
const faster = bg.slice(bg.indexOf('function _qFaster'), bg.indexOf('function _qFaster') + 800);
ok(/_q\.floor\s*=/.test(faster), 'sucessos seguidos derrubam também o PISO aprendido');
ok(/_Q_DEFAULTS\.floor/.test(faster), 'o piso nunca desce abaixo do piso de fábrica');

// ── A ABA JÁ ESTÁ NA PÁGINA → NÃO NAVEGA E NÃO ESPERA ────────────────────────
// "porque fica 1min abrindo o perfil que já está aberto?" — navegar pra mesma URL
// recarrega a página E ainda cobra a espera de renderização derivada do passo aprendido.
{
  const nav = bg.slice(bg.indexOf('function navLetzplayTab'), bg.indexOf('// EXTRATOR do PERFIL'));
  ok(/chrome\.tabs\.get\(/.test(nav), 'navLetzplayTab confere a URL atual da aba antes de navegar');
  ok(/jaEstava/.test(nav), 'e responde na hora quando já está na página');
  ok(/t\.status === 'complete'/.test(nav), 'só considera "já está" com a página carregada');
  ok(/function seguir\(\)/.test(nav) && /[^n]seguir\(\);/.test(nav),
    'o caminho normal de navegação continua existindo pra quando NÃO está');
}

// ── O CASTIGO APRENDIDO EXPIRA ───────────────────────────────────────────────
// Sem prazo, uma tarde ruim deixava a leitura lenta pra sempre — medido: letzplay
// respondendo em 0,3–2,2 s e a fila esperando 10–25 s por causa de um bloqueio antigo.
{
  ok(/blockAt/.test(bg), 'a fila registra QUANDO apanhou');
  const carga = bg.slice(bg.indexOf('chrome.storage.local.get([_Q_KEY]'), bg.indexOf('var _qSaveT'));
  ok(/6 \* 3600000/.test(carga), 'sem bloqueio nas últimas 6 h, o passo volta ao de fábrica');
  ok(/return;/.test(carga), 'e o castigo vencido é simplesmente descartado');
  const dump = bg.slice(bg.indexOf('function _qDump'), bg.indexOf('function _qDump') + 220);
  ok(/blockAt/.test(dump), 'o instante do bloqueio é persistido junto com o passo');
  const slower = bg.slice(bg.indexOf('function _qSlower'), bg.indexOf('function _qSlower') + 420);
  ok(/_q\.blockAt = Date\.now\(\)/.test(slower), 'apanhar carimba o instante');
}

console.log((fail ? '✗' : '✓') + ' letzplay-open-profile: ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);

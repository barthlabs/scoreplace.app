/* BOX "📋 Ficaram de fora desta rodada" — ORDEM DAS SEÇÕES
 * node tests/ficaram-de-fora-ordem.test.js
 *
 * REGRESSÃO reportada pelo dono (ago/2026): "a lista de espera deve aparecer logo abaixo
 * dos inativos, num box próprio âmbar, dentro do box 'ficaram de fora desta rodada' (já
 * havíamos feito isso)".
 *
 * O QUE ACONTECEU: até b1ffc887 a Lista de espera era um bloco SOLTO logo abaixo do box.
 * Esse commit a moveu PRA DENTRO do box (certo) mas a concatenou em PRIMEIRO lugar:
 *   _waitBoxHtml + _inactiveHtml + _woHtml + _remainderHtml
 * — ou seja ela passou a aparecer ACIMA dos Desativados. A ordem certa lê do mais
 * definitivo pro mais móvel: Desativados → Lista de espera → W.O. → Sem grupo.
 *
 * Este teste EXTRAI a IIFE REAL do bracket.js (o único render deste box) e a executa com o
 * doc REAL do Confra — 2 inativos com folga (`isSitOut`/`sitOutReason:'inactive'`) e a
 * pessoa que entrou depois do sorteio na espera. Não é cópia do markup: é o código do app.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

require(path.join(ROOT, 'functions-autodraw', 'draw-core.js'));
const win = globalThis.window;

// ── Extrai a IIFE do box direto do arquivo do app ────────────────────────────
const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');
const marker = "// v0.16.95: seção \"Ficaram de fora desta rodada\"";
const mi = src.indexOf(marker);
ok(mi !== -1, 'não achei o bloco do box em bracket.js');
const start = src.lastIndexOf('${(() => {', mi);
const end = src.indexOf("'</details>';\n      })()}", start);
ok(start !== -1 && end !== -1, 'não consegui delimitar a IIFE do box');
const body = src.slice(start + '${'.length, end + "'</details>';\n      })()".length);

function renderBox(t) {
  const round = t.rounds[0];
  const ctx = {
    _getWaitlist: win._getWaitlist,
    _pName: (e, fb) => String((e && (e.displayName || e.name)) || e || fb || '').trim(),
    _safeHtml: (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])),
    _resolveSideLive: (tt, s) => s,
    _slotUidsPositional: (m) => (m.p1Uid ? [m.p1Uid] : []),
    _idMapHas: () => true,
    _tournamentIsSameDay: () => false,
    _showPlayerStats: () => {},
    _currentBracketTournament: t,
    _monarchHealInFlight: true,      // não dispara o auto-heal no teste
    _healMonarchRemainderToWaitlist: null,
    _warn: () => {},
  };
  ctx.window = ctx;
  const fn = new Function('window', 't', 'currentRoundData', '_isReiRainhaRound', '_nameMatchesCurUser', '_t',
    'with (window) { return (' + body + '); }');
  return fn(ctx, t, round, true, () => false, (k) => k);
}

const t = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'confra-pos-sorteio.json'), 'utf8'));
// estado DEPOIS do fix da inscrição: quem entrou pós-sorteio está na espera
t.standbyParticipants = [{ uid: 'uid_sandra', displayName: 'Sandra', name: 'Sandra', ligaActive: true }];

const html = renderBox(t);

// ── 1. O box existe e tem as duas seções ────────────────────────────────────
ok(html.indexOf('Ficaram de fora desta rodada') !== -1, 'o box não foi renderizado');
const iInativos = html.indexOf('Desativados (');
const iEspera = html.indexOf('Lista de espera (');
ok(iInativos !== -1, 'faltou a seção Desativados (os 2 inativos do Confra têm folga na rodada)');
ok(iEspera !== -1, 'faltou a seção Lista de espera');
ok(html.indexOf('Desativados (2)') !== -1, 'devia listar os 2 inativos reais');
ok(html.indexOf('Lista de espera (1)') !== -1, 'devia listar 1 pessoa na espera');
ok(html.indexOf('Sandra') !== -1, 'quem entrou depois do sorteio tem que aparecer na espera');

// ── 2. A ORDEM: espera LOGO ABAIXO dos inativos ─────────────────────────────
ok(iInativos < iEspera, 'REGRESSÃO: a Lista de espera está ACIMA dos Desativados (tem que vir logo abaixo)');

// ── 3. Nada entre um e outro (é "logo abaixo", não "no fim do box") ─────────
const meio = html.slice(iInativos, iEspera);
ok(meio.indexOf('W.O. (') === -1 && meio.indexOf('Sem grupo (') === -1,
  'a Lista de espera tem que vir IMEDIATAMENTE depois dos Desativados, sem W.O./Sem grupo no meio');

// ── 4. Box PRÓPRIO e ÂMBAR ──────────────────────────────────────────────────
const caixaEspera = html.slice(html.lastIndexOf('<div', iEspera - 200) , iEspera);
ok(caixaEspera.indexOf('251,191,36') !== -1, 'a Lista de espera precisa do seu box âmbar (rgba(251,191,36,…))');
ok(caixaEspera.indexOf('border-radius:10px') !== -1, 'box próprio (mesma moldura das outras seções)');
// e o dos inativos continua vermelho — os dois não podem virar a mesma cor
const caixaInat = html.slice(html.lastIndexOf('<div', iInativos - 200), iInativos);
ok(caixaInat.indexOf('239,68,68') !== -1, 'Desativados continua no box vermelho');

// ── 5. DENTRO do box, não solto abaixo dele ─────────────────────────────────
ok(html.indexOf('</details>') > iEspera, 'a Lista de espera tem que estar DENTRO do <details> do box');

// Deixa o HTML pra inspeção visual (o mesmo que o teste acabou de medir).
const out = process.env.SP_BOX_OUT;
if (out) { try { fs.writeFileSync(out, html); } catch (e) {} }

console.log((fail === 0 ? '✅' : '❌') + ' ficaram-de-fora-ordem: ' + pass + ' asserções, ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);

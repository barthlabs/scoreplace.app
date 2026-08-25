/* O RELÓGIO TEM COR (adiantado/no programado/atrasado) E FICA NO CENTRO.
 * node tests/relogio-cor-do-ritmo-e-centrado.test.js
 *
 * RELATO DO DONO (21/ago/2026, com o print do card em andamento):
 *   1) _"no plano, os contadores de tempo apareciam em cores de acordo com adiantado, no
 *      programado e atrasado. isso não está na tela."_ — e, na 2ª volta, a régua final:
 *      _"vermelho quando atrasado. conforme estiver ficando próxima amarelo; quando
 *      estiver junto ou adiantado verde."_ (a 1ª volta tinha proposto azul pro "no
 *      programado"; o dono trocou pelo SEMÁFORO, que se lê sem legenda.)
 *   2) _"na rodada, o final estimado está em 1 linha deslocando o contador de tempo da
 *      rodada para a esquerda do centro. vamos quebrar essa linha (e também do início real,
 *      para acompanhar) permitindo que o contador fique centralizado."_
 *
 * (1) eram DOIS defeitos, não um:
 *   • A régua não tinha os três estados que se lê sem legenda (verde/amarelo/vermelho).
 *   • E a cor que existia SUMIA NA TELA: sobre foto de capa, a tarja de leitura força
 *     TODO o texto da seção pra uma cor só e levava o relógio junto (era o card do print).
 *     ⚠️ O número do relógio mora em spans FILHOS (o relógio quebra em 2 linhas), então
 *     poupar só o elemento pai NÃO resolve — foi medido no navegador: pai colorido,
 *     filhos brancos. Por isso a cor mora em CLASSE (.sp-ritmo.sp-ritmo-*), que pega o
 *     elemento E os descendentes e tem especificidade pra vencer a tarja.
 *
 * (2) a coluna da direita ("final estimado" numa linha) era a coisa mais larga da linha e
 *     empurrava o relógio pra esquerda. Rótulo em 2 linhas + grid 1fr/auto/1fr = centro
 *     de verdade (o painel do TORNEIO COMPLETO já usava esse grid; a rodada, não).
 */
const fs = require('fs');
const path = require('path');
const H = require('./headless.js');
const W = H.window;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const D = 86400000, MIN = 60000;
const iso = (ms) => { const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()); };
const hhmm = (ms) => { const d = new Date(ms), p = (n) => String(n).padStart(2, '0'); return p(d.getHours()) + ':' + p(d.getMinutes()); };
W._photoReadBox = W._photoReadBox || function () { return { bg: 'rgba(0,0,0,0.60)', fg: '#e2e8f0', border: 'rgba(255,255,255,0.12)' }; };

// fase começou há `passado` dias e acaba em `resta` → controla o PREVISTO (tempo)
function confra(passadoD, restaD, nDone, nTotal) {
  const now = Date.now();
  const iniMs = now - passadoD * D, fimFase0 = now + restaD * D, fimTorneio = now + (restaD + 70) * D;
  const matches = [];
  for (let i = 0; i < nTotal; i++) {
    const m = { id: 'm' + i, p1: 'A' + i + ' / B' + i, p2: 'C' + i + ' / D' + i, startedAt: iniMs + i * MIN };
    if (i < nDone) { m.winner = m.p1; m.resultAt = iniMs + i * MIN + 30 * MIN; }
    matches.push(m);
  }
  return {
    id: 'tour_ritmo', name: '(SB) Confra BT', format: 'Liga', status: 'active', currentPhaseIndex: 0,
    drawManual: false, drawIntervalDays: null,
    startDate: iso(iniMs), startTime: hhmm(iniMs), endDate: iso(fimFase0), endTime: hhmm(fimFase0),
    phases: [
      { name: 'Rei/Rainha', formatCode: 'liga', format: 'Liga', rounds: 1, reiRainha: true, drawMode: 'rei_rainha', startDate: iso(iniMs), startTime: hhmm(iniMs), endDate: iso(fimFase0), endTime: hhmm(fimFase0) },
      { name: 'Eliminatória', formatCode: 'elim_simples', format: 'Eliminatórias Simples', rounds: 1, startDate: iso(fimFase0), startTime: '08:00', endDate: iso(fimTorneio), endTime: hhmm(fimTorneio) },
    ],
    rounds: [{ round: 1, matches: matches }], matches: [],
  };
}
// classe do PRIMEIRO relógio do HTML (o da rodada)
function ritmoDaRodada(html) {
  const m = /class="sp-ritmo sp-ritmo-(\w+)"/.exec(html);
  return m ? m[1] : null;
}

ok(typeof W._tProgRitmo === 'function', '_tProgRitmo existe (régua ÚNICA do card)');

// ─── 1) OS TRÊS ESTADOS, com nome ──────────────────────────────────────────────────────
(function () {
  ok(W._tProgRitmo(0.60, 0.20, false) === 'emdia', 'jogou 60% com 20% do prazo → ADIANTADO, verde');
  ok(W._tProgRitmo(0.18, 0.20, false) === 'emdia', 'jogou 18% com 20% do prazo → junto do programado, VERDE');
  ok(W._tProgRitmo(0.10, 0.20, false) === 'apertando', 'defasagem de 10 pontos → AMARELO (está ficando perto)');
  ok(W._tProgRitmo(0.10, 0.60, false) === 'atrasado', 'jogou 10% com 60% do prazo → VERMELHO');
  ok(W._tProgRitmo(0.02, 0.20, false) === 'atrasado', 'defasagem de 18 pontos → VERMELHO');
  ok(W._tProgRitmo(0.30, 0.90, true) === 'emdia', 'rodada/torneio CONCLUÍDO nunca fica vermelho');
  ok(W._tProgRitmoBarra('emdia') === '#10b981' && W._tProgRitmoBarra('apertando') === '#f59e0b' && W._tProgRitmoBarra('atrasado') === '#ef4444',
     'a BARRA usa a mesma régua (verde/amarelo/vermelho) — número e barra nunca contam histórias diferentes');
  ok(W._tProgRitmo(0.18, 0.20, false) !== 'azul' && ['emdia','apertando','atrasado'].indexOf(W._tProgRitmo(0.18, 0.20, false)) > -1,
     'o AZUL da 1ª volta saiu — a régua é o semáforo');
})();

// ─── 2) a cor CHEGA no HTML do relógio da rodada ───────────────────────────────────────
(function () {
  ok(ritmoDaRodada(W._buildProgressInner(confra(2, 8, 61, 102))) === 'emdia', '[rodada] 60% jogado / 20% do prazo → relógio VERDE');
  ok(ritmoDaRodada(W._buildProgressInner(confra(2, 8, 11, 102))) === 'apertando', '[rodada] 11% jogado / 20% do prazo → relógio AMARELO');
  ok(ritmoDaRodada(W._buildProgressInner(confra(6, 4, 10, 102))) === 'atrasado', '[rodada] 10% jogado / 60% do prazo → relógio VERMELHO');

  const html = W._buildProgressInner(confra(6, 4, 10, 102));
  ok((html.match(/class="sp-ritmo sp-ritmo-/g) || []).length === 2, '[dois relógios] rodada E torneio completo saem com cor (são 2 renderizadores)');
  ok(html.indexOf('#3b82f6;font-variant') === -1, '[azul] o azul da 1ª volta não pinta mais relógio nenhum');
  ok(/<span[^>]*data-sp-fixa="1"/.test(html), 'o relógio sai marcado com data-sp-fixa (gancho da tarja de foto)');
})();

// ─── 3) A COR SOBREVIVE À TARJA DE FOTO — e alcança os FILHOS ──────────────────────────
(function () {
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'style.css'), 'utf8');
  const paleta = fs.readFileSync(path.join(__dirname, '..', 'css', 'paleta.css'), 'utf8');
  /* ⭐ 2.0.94 — O TOM MUDOU DE LUGAR, A REGRA NÃO. O tom do claro e a exceção da tarja
   * moravam em 6 + 12 regras no style.css. Agora o tom vem de um token (--sp-ritmo-*,
   * css/paleta.css) e a exceção da tarja é UMA regra por estado — que precisa manter
   * `!important` e a especificidade (0,3,0) pra vencer o <style> escopado da caixa de
   * leitura, que é (0,2,0). Sem os dois a regressiva do Confra virava cinza (medido). */
  ['emdia', 'apertando', 'atrasado'].forEach(function (e) {
    ok(css.indexOf('.sp-ritmo.sp-ritmo-' + e + ' *') > -1,
       '[' + e + '] a regra alcança os DESCENDENTES (o número mora em spans filhos — pai colorido e filho branco foi o defeito medido)');
    ok(new RegExp('\\.sp-ritmo\\.sp-ritmo-' + e + '[^{]*\\{[^}]*var\\(--sp-ritmo-' + e).test(css),
       '[' + e + '] a cor vem do token da tabela (--sp-ritmo-' + e + ')');
    const _tarja = new RegExp('\\[style\\*="--sp-(?:tarja|leitura2)"\\] \\.sp-ritmo\\.sp-ritmo-' + e);
    ok(_tarja.test(paleta),
       '[' + e + '] tem tom próprio DENTRO da tarja de foto (escura nos dois temas)');
    const _bloco = paleta.slice(paleta.search(_tarja));
    ok(/!important/.test(_bloco.slice(0, _bloco.indexOf('}') + 1)),
       '[' + e + '] a exceção da tarja mantém o !important (sem ele perde pro <style> da caixa)');
    ok(new RegExp('--sp-ritmo-' + e + '\\s*:').test(paleta),
       '[' + e + '] tem tom próprio no TEMA CLARO (contraste é regra dos dois temas)');
  });
  // classe DUPLA: é ela que dá especificidade pra vencer o <style> escopado da tarja
  ok(css.indexOf('.sp-ritmo.sp-ritmo-atrasado') > -1, 'a classe é DUPLA (.sp-ritmo + estado) — é o que vence o achatamento da tarja');
  const js = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-utils.js'), 'utf8');
  ok(js.indexOf("class=\"sp-ritmo sp-ritmo-'") > -1, 'o JS emite as DUAS classes');
})();

// ─── 4) O RELÓGIO NO CENTRO: rótulo em 2 linhas + grid 1fr/auto/1fr ────────────────────
(function () {
  const html = W._buildProgressInner(confra(6, 4, 10, 102));
  ok(html.indexOf('início<br>real') > -1, '[rodada] "início real" quebrado em 2 linhas');
  ok(html.indexOf('final<br>estimado') > -1, '[rodada] "final estimado" quebrado em 2 linhas (era ELE que empurrava o relógio)');
  ok(html.indexOf('>início real<') === -1 && html.indexOf('>final estimado<') === -1, '[rodada] nenhum rótulo lateral sobrou em 1 linha');
  const grids = (html.match(/grid-template-columns:1fr auto 1fr/g) || []).length;
  ok(grids === 2, '[centro] as DUAS linhas de relógio (rodada e torneio completo) usam grid 1fr/auto/1fr — got ' + grids);
  ok(html.indexOf('justify-content:space-between;align-items:flex-start;margin-bottom:7px') === -1,
     '[centro] a linha da rodada não é mais space-between (que centrava no que SOBRAVA, não no box)');
})();

console.log('\n  ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);

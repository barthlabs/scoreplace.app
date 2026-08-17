/* O TIEBREAK NÃO ENTRA NO PLACAR — e por isso o vencedor para de sair invertido.
 *
 * O QUE ESTE TESTE EXISTE PRA IMPEDIR (16/ago/2026): o dono viu "55–6" e "54–6" na lista
 * de jogos e disse "ta com cara de tiebreak". Estava certo, e o estrago era maior que
 * placar feio.
 *
 * O letzplay rende o placar como `5<sub>4</sub>` — 5 games, tiebreak 4. O leitor pegava
 * `textContent` do container, que ENGOLE o <sub>, e gravava `54`. Contra o `6` do outro
 * lado, a conta `meu > dele` dizia VITÓRIA num jogo que foi 5(4)–6, ou seja DERROTA.
 *
 * Medido nos 12 docs de leitura em produção: 1.684 jogos, 228 com o placar corrompido
 * (13,5%) e os 228 com o RESULTADO INVERTIDO. Contaminava vitórias, derrotas, %,
 * sequência atual, maior sequência e a ficha do atleta — e era parte do "v/d ainda nao
 * bate" que o dono vinha reclamando.
 *
 * Cobre os dois lados, porque cada um sozinho deixa metade do estrago de pé:
 *   • ESCRITA (extensão): o extrator real, num Chromium, contra o markup real;
 *   • LEITURA (app): a cura de quem JÁ tem o dado errado — nos DOIS formatos, o doc
 *     resumo (perspectiva eu/adversário) e o doc canônico (neutro, dois times).
 *
 * Roda com: node tests/tiebreak-nao-entra-no-placar.test.js
 */
const path = require('path');
const fs = require('fs');
const { chromium } = require('@playwright/test');

const ROOT = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

let falhas = 0, testes = 0;
function ok(cond, msg) {
  testes++;
  if (cond) console.log('  ✓ ' + msg);
  else { falhas++; console.log('  ✗ ' + msg); }
}
function eq(a, b, msg) { ok(JSON.stringify(a) === JSON.stringify(b), msg + ' (obtido: ' + JSON.stringify(a) + ')'); }

/* ── markup REAL da página de jogos (letzplay.me/.../matches, 16/ago/2026) ─────────── */
// ⭐ O letzplay MARCA o vencedor: `highlight` + <strong> em quem ganhou, `no-highlight`
// em quem perdeu. É a fonte mais forte de quem venceu — mais que comparar números.
function ladoTime(handles, games, tiebreak, venceu) {
  const cls = venceu ? 'highlight' : 'no-highlight';
  const num = venceu ? ('<strong>' + games + '</strong>') : (games + '<sub>' + (tiebreak == null ? '' : tiebreak) + '</sub>');
  return '<div class="row match-player">' +
    '<div class="match-player-info">' +
      handles.map(h => '<a href="/' + h + '">' + h + '</a>').join('') +
    '</div>' +
    '<div class="match-results-points" style="margin-right:-1px;">' +
      '<div class="col-xs-1 text-center match-points pad-no ' + cls + ' vertical-center"> ' + num + ' </div>' +
    '</div>' +
  '</div>';
}
// O card é `.row.match` e a identidade vem da classe `match-{id}-schedule` — é assim que
// o letzplay rende, e é o que o extrator procura.
function cardJogo(lzId, a, b) {
  return '<div class="row match">' +
    '<div class="col-xs-12">' +
      '<a href="/paineiras-bt/rankings/33695">BT SOCIAL - Cat Masculina D • Rodada: 16</a>' +
      '<div class="match-' + lzId + '-schedule">Terça, 30/09/25 às 19:00hs • Areia 3</div>' +
      a + b +
    '</div></div>';
}

/* ── LADO DA ESCRITA ───────────────────────────────────────────────────────────────── */
async function ladoEscrita(browser) {
  const src = read('extension/lib/letzplay-extract.js');
  ok(/_lim\.querySelectorAll\('sub'\)/.test(src),
     'ESCRITA · o <sub> do tiebreak é removido antes de ler o placar');
  ok(!/var ptxt = pe \? \(pe\.textContent/.test(src),
     'ESCRITA · o placar não sai mais do textContent cru do container');

  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body></body></html>');
  await page.addScriptTag({ content: src });

  const casos = [
    // [rótulo, meus games, meu tb, games dele, tb dele, esperado my, esperado opp, ganhei?]
    ['5(4) contra 6 — derrota que virava vitória', 5, 4, 6, null, 5, 6, false],
    ['6 contra 5(3) — vitória que virava derrota', 6, null, 5, 3, 6, 5, true],
    ['7 contra 6(5)',                              7, null, 6, 5, 7, 6, true],
    ['5(11) contra 6 — tiebreak de 2 dígitos',     5, 11, 6, null, 5, 6, false],
    ['6 contra 1 — sem tiebreak, nada muda',       6, null, 1, null, 6, 1, true],
    ['0 contra 6 — sub vazio, nada muda',          0, '', 6, '', 0, 6, false],
  ];

  for (const [rot, mg, mtb, og, otb, eMy, eOpp, eWon] of casos) {
    const html = cardJogo('m1',
      ladoTime(['RodrigoBarth', 'MarcoVasco'], mg, mtb, eWon),
      ladoTime(['HenriqueTanaka2', 'RicardoPettena'], og, otb, !eWon));
    const g = await page.evaluate(([h]) => {
      const doc = new DOMParser().parseFromString('<html><body>' + h + '</body></html>', 'text/html');
      const r = window._spExtract.extractMatchesFromDoc(doc, 'RodrigoBarth');
      return r && r[0] ? { my: r[0].myScore, opp: r[0].oppScore, won: r[0].won } : null;
    }, [html]);
    eq(g, { my: eMy, opp: eOpp, won: eWon }, 'ESCRITA · ' + rot);
  }
  // ⭐ A MARCA MANDA: mesmo com o placar ausente, o vencedor sai do que o letzplay marcou.
  const semPlacar = cardJogo('m2',
    ladoTime(['RodrigoBarth'], '', null, true),
    ladoTime(['HenriqueTanaka2'], '', null, false));
  const gm = await page.evaluate(([h]) => {
    const doc = new DOMParser().parseFromString('<html><body>' + h + '</body></html>', 'text/html');
    const r = window._spExtract.extractMatchesFromDoc(doc, 'RodrigoBarth');
    return r && r[0] ? r[0].won : 'sem jogo';
  }, [semPlacar]);
  ok(gm === true, 'ESCRITA · o vencedor vem da MARCA do letzplay, não da conta de placar');

  const src2 = read('extension/lib/letzplay-extract.js');
  ok(/no-highlight/.test(src2), 'ESCRITA · o extrator lê a marca de vencedor da página');
  ok(/typeof mine\.venceu === 'boolean'/.test(src2),
     'ESCRITA · a marca tem precedência sobre a comparação de placar');

  await page.close();
}

/* ── LADO DA LEITURA ───────────────────────────────────────────────────────────────── */
function ladoLeitura() {
  const store = read('js/store.js');
  const ini = store.indexOf('window._lzPlacarReal = function');
  const fim = store.indexOf('\n\nwindow._LZ_CLUBE_RESERVADO');
  ok(ini > 0 && fim > ini, 'LEITURA · as funções de cura vivem no store.js (fonte única)');
  const w = {};
  new Function('window', store.slice(ini, fim))(w);

  // o placar real é o primeiro dígito — e só quando passou de um dígito
  eq([0, 6, 7, 9].map(w._lzPlacarReal), [0, 6, 7, 9], 'LEITURA · placar de um dígito passa INTACTO');
  eq([54, 55, 511, 510, 42, 65].map(w._lzPlacarReal), [5, 5, 5, 5, 4, 6],
     'LEITURA · placar com tiebreak colado vira o primeiro dígito');
  eq([null, undefined, NaN, 'x'].map(w._lzPlacarReal), [null, null, null, 'x'],
     'LEITURA · valor que não é número passa sem quebrar');

  // ⚠️ o `won` é DERIVADO: sem recalcular, o veredito continuaria invertido
  const g = w._lzCuraJogo({ myScore: 54, oppScore: 6, won: true, partnerName: 'Marco Vasco' });
  eq({ my: g.myScore, opp: g.oppScore, won: g.won }, { my: 5, opp: 6, won: false },
     'LEITURA · 54–6 vira 5–6 e a VITÓRIA falsa vira derrota');
  ok(g.partnerName === 'Marco Vasco', 'LEITURA · a cura não perde os outros campos do jogo');
  const g2 = w._lzCuraJogo({ myScore: 6, oppScore: 53, won: false });
  eq({ my: g2.myScore, opp: g2.oppScore, won: g2.won }, { my: 6, opp: 5, won: true },
     'LEITURA · 6–53 vira 6–5 e a DERROTA falsa vira vitória');
  const bom = { myScore: 6, oppScore: 2, won: true };
  ok(w._lzCuraJogo(bom) === bom, 'LEITURA · jogo já correto passa pela MESMA referência (zero trabalho)');

  // doc canônico: neutro, dois times, e `vencedor` também é derivado
  const m = w._lzCuraMatchCanon({ teams: [{ handles: ['a'], score: 54 }, { handles: ['b'], score: 6 }], vencedor: 0 });
  eq([m.teams[0].score, m.teams[1].score, m.vencedor], [5, 6, 1],
     'LEITURA · no doc canônico o placar é curado e o `vencedor` recalculado');
  const mOk = { teams: [{ score: 6 }, { score: 3 }], vencedor: 0 };
  ok(w._lzCuraMatchCanon(mOk) === mOk, 'LEITURA · doc canônico correto passa intacto');
  ok(w._lzCuraMatchCanon({ teams: [{ score: 5 }] }).teams.length === 1,
     'LEITURA · doc sem os dois times não quebra');

  // o import inteiro, curado UMA vez
  const imp = { handle: 'x', games: [{ myScore: 55, oppScore: 6, won: true }, { myScore: 6, oppScore: 2, won: true }] };
  const cur = w._lzCuraImport(imp);
  eq(cur.games.map(x => [x.myScore, x.oppScore, x.won]), [[5, 6, false], [6, 2, true]],
     'LEITURA · o import é curado inteiro, jogo a jogo');
  ok(cur.handle === 'x', 'LEITURA · o resto do import é preservado');
  const impOk = { games: [{ myScore: 6, oppScore: 1, won: true }] };
  ok(w._lzCuraImport(impOk) === impOk, 'LEITURA · import sem defeito passa pela mesma referência');

  // os DOIS pontos de entrada aplicam a cura — um só deixaria metade das telas mentindo
  ok(/this\.currentUser\.letzplayImport = window\._lzCuraImport\(profile\.letzplayImport\)/.test(store),
     'ENTRADA · o doc resumo é curado ao carregar o perfil');
  const hist = read('js/views/letzplay-history-write.js');
  ok(/_lzCuraMatchCanon\(m\)/.test(hist),
     'ENTRADA · a leitura canônica cura cada partida');
}

(async () => {
  console.log('\n═══ tiebreak não entra no placar ═══\n');
  const browser = await chromium.launch();
  try { await ladoEscrita(browser); console.log(''); ladoLeitura(); }
  finally { await browser.close(); }
  console.log('\n' + (falhas ? '❌ ' + falhas + ' falha(s) de ' + testes : '✅ ' + testes + ' asserções, 0 falhas') + '\n');
  process.exit(falhas ? 1 : 0);
})();

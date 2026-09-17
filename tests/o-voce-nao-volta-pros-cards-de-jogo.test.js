/* O "(você)" NÃO VOLTA PROS CARDS DE JOGO (leva 2.1.12)
 *
 * Ordem do dono (27/ago/2026), olhando "Seus últimos resultados": _"tira o (voce) daqui. a
 * cor destacada já identifica o usuário e esse vc esta quebrando o alinhamento dos boxes"_.
 *
 * Os dois motivos são verdadeiros, e o segundo é MECÂNICO — vale escrever porque explica
 * por que o rótulo não pode simplesmente voltar "menorzinho":
 * o "(você)" entrava DENTRO da caixa de ajuste (.sp-name-fit / .sp-mc-box). O motor mede o
 * conteúdo da caixa e encolhe a FONTE até caber. Com o rótulo junto, ele media
 * "Rodrigo Barth (você)" e reduzia o nome — então o box de quem está olhando ficava com a
 * fonte MENOR que a dos adversários, e a linha desalinhava. Qualquer variante do rótulo
 * dentro dessa caixa reproduz o mesmo efeito.
 *
 * ⛔ ESCOPO: só os cards de JOGO da dashboard. O "(você)" segue existindo — de propósito —
 * em presença, troféus, letzplay, inscritos e no e-mail: lá não há caixa de ajuste, o
 * argumento do alinhamento não se aplica, e o dono não pediu.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── o "(você)" não volta pros cards de jogo ────');

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'dashboard.js'), 'utf8');
const bracket = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
const recentIni = src.indexOf('// ── Últimos resultados confirmados');
const recentFim = src.indexOf('// Agrupa por (grupo + torneio)', recentIni);
const recent = src.slice(recentIni, recentFim);
const cardIni = bracket.indexOf('function renderMatchCard');
const cardFim = bracket.indexOf('window.renderMatchCard', cardIni);
const canonicalCard = bracket.slice(cardIni, cardFim);
// tira comentários: a justificativa da remoção CITA o rótulo, e sem isto o teste se
// acusaria sozinho lendo o próprio texto que explica a remoção.
const cod = src.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');

ok(cod.indexOf('(você)') === -1,
   '⛔ nenhum card de jogo da dashboard imprime "(você)" (ele quebra o ajuste de fonte do box)');

// ── o que IDENTIFICA o usuário tem que continuar de pé ───────────────────────
// Sem isto, "passou verde" poderia significar que alguém tirou o rótulo E o destaque —
// e aí ninguém acha o próprio jogo, que é pior que o desalinhamento.
ok(recent.includes('window.renderMatchCard(m2'),
   'Últimos Resultados delega ao card canônico, sem renderer próprio');
ok(/_isMyMatch/.test(canonicalCard) && /data-my-match/.test(canonicalCard),
   'o card canônico mantém a marca visual de quem está olhando, sem rótulo textual');
ok(/_isMe\(name\)\n?\s*\? '<b style="color:var\(--sp-c-e2e8f0/.test(cod),
   'na linha de confronto, o negrito claro segue marcando o usuário');

// ── e o rótulo continua onde ele NÃO atrapalha (não foi uma varredura cega) ──
const outras = ['presence.js', 'trophies-view.js', 'letzplay-profile.js', 'tournaments-organizer.js'];
outras.forEach(f => {
  const p = path.join(__dirname, '..', 'js', 'views', f);
  if (!fs.existsSync(p)) return;
  ok(fs.readFileSync(p, 'utf8').indexOf('(você)') !== -1,
     f + ' mantém o "(você)" — lá não há caixa de ajuste, e o dono não pediu');
});

console.log(pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);

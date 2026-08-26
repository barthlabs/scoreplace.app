/* O OUVINTE DOS JOGOS SEGUE A TELA ABERTA — E SÓ ELA (2.0.112)
 * node tests/ouvinte-de-jogos-segue-a-tela-aberta.test.js
 *
 * ⭐ É AQUI QUE A DIVISÃO PASSA A VALER. Sem este ouvinte, tirar os jogos do documento só
 * troca de lugar: quem está com a chave aberta continua recebendo o eco do DOCUMENTO a
 * cada mudança. Com ele, um ponto de placar entrega **o jogo que mudou** (~1 KB) em vez do
 * torneio inteiro (214 KB) — e esse eco é pago por TODA tela aberta na quadra, não só pela
 * de quem lançou.
 *
 * ⛔ E ele é o terceiro de três peças que precisam existir JUNTAS:
 *   ① a rede (enxerta o que está em memória) — cobre o re-render;
 *   ② a BUSCA (traz o todo uma vez) — cobre o primeiro carregamento; foi ela que faltou e
 *     quebrou produção em 26/ago;
 *   ③ este ouvinte (traz o delta) — é o ganho.
 * Uma sem a outra deixa a tela ou vazia, ou parada, ou cara.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const router = fs.readFileSync(path.join(ROOT, 'js', 'router.js'), 'utf8');

// ── roda o ouvinte de verdade ───────────────────────────────────────────────
const i = store.indexOf('  ouvirJogosDoTorneio(tournamentId) {');
ok(i > 0, 'o ouvinte existe');
const j = store.indexOf('  pararDeOuvirJogos() {');
const corpo = store.slice(i, store.indexOf('\n  },', j) + 4);

let soltas = 0, assinou = null;
const fakeDb = { collection: () => ({ doc: () => ({ collection: () => ({
  onSnapshot: (f, e) => { assinou = f; return function () { soltas++; }; } }) }) }) };
const ctx = {
  window: { FirestoreDB: { db: fakeDb }, _tSplit: {
      remontar: (p) => Object.assign({}, p.config, { _montado: p.matches.length }) },
    _softRefreshView: () => {}, _error: () => {}, _warn: () => {}, _noteFsReads: () => {} },
  JSON: JSON
};
vm.createContext(ctx);
vm.runInContext('var API = {' + corpo + '};\nthis.API = API;', ctx);
const API = ctx.API;

// ── ① torneio INTEIRO não é ouvido (não há subcoleção que valha) ────────────
const alvo = { id: 't1', _semPesados: ['matches'], rounds: [{ matches: [] }] };
API.tournaments = [{ id: 'inteiro', rounds: [] }];
API.ouvirJogosDoTorneio('inteiro');
ok(!API._jogosSub, '⛔ torneio NÃO dividido não abre assinatura nenhuma — o doc já traz tudo');

// ── ② torneio dividido é ouvido ─────────────────────────────────────────────
API.tournaments = [alvo];
API.ouvirJogosDoTorneio('t1');
ok(API._jogosSub && API._jogosSub.id === 't1', '⭐ torneio dividido abre a assinatura');

// ── ③ ouvir o MESMO não reabre; ouvir OUTRO solta o anterior ───────────────
API.ouvirJogosDoTorneio('t1');
ok(soltas === 0, '⛔ ouvir o mesmo torneio de novo NÃO reabre (re-render não vira assinatura nova)');
API.tournaments = [alvo, { id: 't2', _semPesados: ['matches'] }];
API.ouvirJogosDoTorneio('t2');
ok(soltas === 1 && API._jogosSub.id === 't2',
  '⭐ abrir outro SOLTA o anterior — uma assinatura viva por vez, nunca duas');

// ── ④ o delta chega e é escrito NO LUGAR ────────────────────────────────────
const vivo = API.tournaments[0];
API.tournaments = [vivo]; API._jogosSub = null;
API.ouvirJogosDoTorneio('t1');
const snap = { forEach: (f) => { f({ data: () => ({ _chave: 'm1' }) }); },
               docChanges: () => [{}] };
assinou(snap);
ok(vivo._montado === 1, '⭐ o delta é remontado e escrito NO LUGAR (mesma referência que as telas guardam)');
ok(!vivo._faltamPesados, '   e a marca de incompleto sai');

// nada mudou → não repinta
let antes = vivo._montado;
assinou({ forEach: () => {}, docChanges: () => [] });
ok(vivo._montado === antes, '⛔ entrega sem mudança nenhuma não repinta — o eco do próprio save não pode custar render');

// ── ⑤ soltar ao sair ────────────────────────────────────────────────────────
soltas = 0; API.pararDeOuvirJogos();
ok(soltas === 1 && !API._jogosSub,
  '⛔ soltar de verdade: assinatura esquecida baixa delta de torneio que ninguém olha e não dá erro nenhum');

// ── ⑥ o roteador liga e desliga, num lugar só ───────────────────────────────
ok(/ouvirJogosDoTorneio\(String\(cleanParam\)\)/.test(router),
  '⭐ a rota do torneio LIGA o ouvinte');
const iS = router.indexOf('pararDeOuvirJogos');
ok(iS > 0 && iS < router.indexOf("case 'tournaments':"),
  '⭐ e o SOLTA antes do despacho — num lugar só, senão uma rota nova amanhã esquece');
ok(/!== 'tournaments'\) window\.AppStore\.pararDeOuvirJogos\(\)/.test(router),
  '   qualquer rota que não seja o torneio fica sem assinatura');

console.log((fail ? '✗' : '✓') + ' ouvinte-de-jogos-segue-a-tela-aberta: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);

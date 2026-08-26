/* O JOGO ESPELHADO DIZ QUEM JOGA — E É ISSO QUE SUSTENTA A REGRA (Fase 2b, 2.0.98)
 * node tests/jogo-espelhado-diz-quem-joga.test.js
 *
 * O documento do torneio tem TETO: o Firestore recusa acima de 1 MB. O Confra saiu de
 * 238 KB (manhã de 25/ago) pra 436 KB no MESMO DIA — `rounds` sozinho são 202 KB. Tirar
 * os jogos do documento é o que remove o teto, e pra isso o cliente precisa poder
 * ESCREVER o jogo. Sem `playerUids` no documento do jogo, liberar essa escrita seria
 * liberar QUALQUER inscrito a mexer em QUALQUER jogo.
 *
 * ⛔ A DERIVAÇÃO NÃO É REIMPLEMENTADA: `dividir` chama `window._matchPlayerUids`
 * (js/views/bracket-logic.js, vendorizado pro servidor), a MESMA que o cliente usa pra
 * autorizar lançamento. Em 25/ago três bugs saíram de lógica duplicada que divergiu.
 *
 * ⚠️ E O TESTE PRECISA RODAR NO SANDBOX CERTO: carregar o tradutor por `require` fora do
 * harness dá um `window` DIFERENTE, e a derivação some — a primeira medição deu 0 de 115
 * por isso, não por bug. No navegador e no servidor há um `window` só.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const H = require(path.join(ROOT, 'tests', 'render-harness'));
const W = H.window;
vm.runInContext(fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournament-split-core.js'), 'utf8'),
                H.sandbox, { filename: 'tournament-split-core.js' });
const S = W._tSplit;
ok(typeof S === 'object' && typeof S.dividir === 'function', 'o tradutor carregou NO MESMO sandbox');
ok(typeof W._matchPlayerUids === 'function',
  '`_matchPlayerUids` mora em bracket-logic (vendorizado) e está visível pros dois lados');

// ── um torneio de mentira, com o que decide: uid no slot ─────────────────────
const t = {
  id: 't1',
  participants: [{ uid: 'ua' }, { uid: 'ub' }, { uid: 'uc' }, { uid: 'ud' }],
  rounds: [{ round: 1, matches: [
    { id: 'm1', p1: 'A / B', p2: 'C / D', team1Uids: ['ua', 'ub'], team2Uids: ['uc', 'ud'] },
    { id: 'folga', p1: 'A', p2: 'BYE', isSitOut: true }
  ] }],
  matches: []
};
const p = S.dividir(t);
const jogo = p.matches.find(function (x) { return x.jogo.id === 'm1'; });
const folga = p.matches.find(function (x) { return x.jogo.id === 'folga'; });

ok(!!jogo && Array.isArray(jogo.playerUids),
  'o jogo espelhado carrega `playerUids` — é o insumo de AUTORIZAÇÃO da CF de escrita');
ok(jogo && jogo.playerUids.length === 4, 'com os QUATRO uids do confronto — veio ' +
  (jogo ? jogo.playerUids.length : 0));
ok(jogo && ['ua', 'ub', 'uc', 'ud'].every(function (u) { return jogo.playerUids.indexOf(u) !== -1; }),
  'e são os uids certos (os dois lados, não só quem propôs)');
ok(!folga || !folga.playerUids, 'folga/BYE não ganha `playerUids` (não há quem jogue)');

// ⛔ a propriedade que autoriza tudo: a volta continua FIEL
ok(S.iguais(S.remontar(p), t),
  'remontar(dividir(t)) segue devolvendo t IDÊNTICO — `playerUids` é metadado do ESPELHO, não entra no jogo');
ok(jogo && jogo.jogo.playerUids === undefined,
  'e o campo NÃO é enfiado dentro do jogo (senão voltaria pro documento do torneio e o engordaria)');

// ── a regra do Firestore usa exatamente esse campo ───────────────────────────
const regras = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
const i = regras.indexOf('match /matches/{matchId}');
ok(i > 0, 'a subcoleção de jogos tem regra própria');
const bloco = regras.slice(i, i + 1800);
ok(/allow read:/.test(bloco), 'leitura liberada (paridade com o documento, que já é legível)');
/* ⛔ O CLIENTE NÃO ESCREVE — ordem do dono (25/ago/2026): _"o certo é tudo rodar em CF só
 * sendo disparado pelo client side"_.
 * Eu tinha escrito aqui um `allow update` por jogador, espelhando `results`. Funcionava,
 * mas punha a AUTORIZAÇÃO em dois lugares (regra + cliente) — e regra de segurança é o
 * pior lugar pra guardar lógica de negócio: não se testa junto, não se loga, e diverge em
 * silêncio. `playerUids` continua sendo gravado; ele deixou de ser insumo da REGRA e virou
 * insumo da CF, que confere quem chamou e grava com o admin SDK. */
ok(/allow write: if false/.test(bloco),
  'o cliente NÃO escreve no jogo — a porta é a Cloud Function');
ok(/tudo rodar em CF|Cloud Function/.test(bloco),
  'e a regra explica POR QUE está fechada (senão alguém "conserta" abrindo)');

console.log((fail ? '✗' : '✓') + ' jogo-espelhado-diz-quem-joga: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);

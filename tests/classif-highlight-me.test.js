/* "SOU EU?" na classificação (verde) — node tests/classif-highlight-me.test.js
 *
 * Pedido do dono: "na classificação vamos usar a cor verde para o nome do usuário e sua
 * posição para que ele se encontre mais facilmente na classificação."
 *
 * DOIS riscos, e o teste tem que cobrir OS DOIS:
 *
 * (A) casar por NOME pinta a linha de OUTRA pessoa. O rótulo de dupla "A / B" é TIPOGRAFIA,
 *     não chave — o mesmo erro que já mordeu o "é o meu jogo?"
 *     (project_uid_identity_canon_locked / project_dupla_entry_structural_not_slash).
 *     Caso venenoso real da Confra: "RODRIGO UNGER PIRES DA SILVA / Vanessa Soares" na mesma
 *     classificação que o Rodrigo Barth logado.
 *
 * (B) a dupla da ELIMINATÓRIA não existe no roster. Ela é FORMADA na transição de fase
 *     (buildEntrantsByDest → mkTeam); t.participants segue com o cadastro da classificatória,
 *     que no Rei/Rainha é INDIVIDUAL. Quem procurar a dupla só em t.participants não acha e
 *     não pinta nada — foi o bug reportado na v1.4.19 ("cadê o verde?", linha 28º
 *     "Vivi Hirata / Rodrigo Barth"). A identidade da dupla vive no SLOT DO JOGO
 *     (team1Uids/p1Uid — project_match_slot_uid_identity).
 *
 * ⚠️ A 1ª versão deste teste tinha as duplas COMO ENTRADAS DO ROSTER — fixture irreal — e
 * por isso ficou verde com o bug (B) em produção. A fixture abaixo é a estrutura de verdade.
 */
const path = require('path');
const { window: W, load } = require(path.join(__dirname, 'headless.js'));
const fs = require('fs');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// _slotUids e _collectAllMatches REAIS (bracket-logic/bracket-model já vêm do harness).
ok(typeof W._slotUids === 'function', 'harness devia expor _slotUids real');
ok(typeof W._collectAllMatches === 'function', 'harness devia expor _collectAllMatches real');

// Só o helper do store.js (o arquivo inteiro toca document no load).
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const i = src.indexOf('window._classifEntryIsMe = function');
const j = src.indexOf('window._renderClassifBlock = function');
ok(i !== -1 && j > i, '_classifEntryIsMe não encontrado no store.js');
vm.runInContext(src.slice(i, j), W, { filename: 'store-classif' });

// ── FIXTURE REAL: roster INDIVIDUAL (Rei/Rainha) + duplas só nos SLOTS da fase 2 ──
const t = {
  id: 't1',
  participants: [
    { displayName: 'Vivi Hirata', name: 'Vivi Hirata', uid: 'uVivi' },
    { displayName: 'Rodrigo Barth', name: 'Rodrigo Barth', uid: 'uRod' },
    { displayName: 'RODRIGO UNGER PIRES DA SILVA', name: 'RODRIGO UNGER PIRES DA SILVA', uid: 'uUnger' },
    { displayName: 'Vanessa Soares', name: 'Vanessa Soares', uid: 'uVa' },
    { displayName: 'Lician Tomimatsu', name: 'Lician Tomimatsu', uid: 'uLi' },
    { displayName: 'Kelly Barth', name: 'Kelly Barth', uid: 'uKe' },
  ],
  matches: [
    { id: 'm1', phaseIndex: 1, bracket: 'silver',
      p1: 'Vivi Hirata / Rodrigo Barth', team1Uids: ['uVivi', 'uRod'],
      p2: 'RODRIGO UNGER PIRES DA SILVA / Vanessa Soares', team2Uids: ['uUnger', 'uVa'], winner: null },
    { id: 'm2', phaseIndex: 1, bracket: 'silver',
      p1: 'Lician Tomimatsu / Kelly Barth', team1Uids: ['uLi', 'uKe'],
      p2: 'TBD', winner: null },
  ],
};

function login(uid) {
  W.AppStore = W.AppStore || {};
  W.AppStore.currentUser = uid ? { uid: uid, displayName: (uid === 'uRod' ? 'Rodrigo Barth' : 'Outro') } : null;
}

// ── (B) a dupla da eliminatória — o bug reportado ────────────────────────────
login('uRod');
ok(W._classifEntryIsMe(t, 'Vivi Hirata / Rodrigo Barth') === true,
  'REGRESSÃO (bug v1.4.19): dupla formada na TRANSIÇÃO não existe no roster — tem que resolver pelo SLOT do jogo');

// ── (A) colisão de nome: NÃO pintar a dupla do outro Rodrigo ─────────────────
ok(W._classifEntryIsMe(t, 'RODRIGO UNGER PIRES DA SILVA / Vanessa Soares') === false,
  'REGRESSÃO: casou por NOME e pintaria a linha de OUTRA pessoa (uid é a identidade)');

// ── terceiros ────────────────────────────────────────────────────────────────
ok(W._classifEntryIsMe(t, 'Lician Tomimatsu / Kelly Barth') === false, 'não devia casar com dupla alheia');

// ── classificação INDIVIDUAL (Rei/Rainha lista PESSOAS, não entradas) ────────
ok(W._classifEntryIsMe(t, 'Rodrigo Barth') === true, 'classificação individual devia resolver a pessoa por uid');
ok(W._classifEntryIsMe(t, 'Vivi Hirata') === false, 'parceira do MESMO time não é "eu"');

// ── entrada SOLO que existe no roster (torneio individual comum) ─────────────
login('uLi');
ok(W._classifEntryIsMe(t, 'Lician Tomimatsu') === true, 'devia reconhecer entrada solo do roster');
ok(W._classifEntryIsMe(t, 'Vivi Hirata / Rodrigo Barth') === false, 'não pode casar com dupla alheia');

// ── sem login / entradas vazias → nunca destaca ──────────────────────────────
login(null);
ok(W._classifEntryIsMe(t, 'Vivi Hirata / Rodrigo Barth') === false, 'visitante não pode ter linha verde');
login('uRod');
ok(W._classifEntryIsMe(t, '') === false, 'nome vazio → false');
ok(W._classifEntryIsMe(null, 'Qualquer') === false, 'sem torneio → false');

console.log((fail === 0 ? '✅' : '❌') + ` classif "sou eu?" por uid: ${pass} ok, ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);

/* 🔵 O USUÁRIO É SEMPRE O TIME AZUL, E O SLOT NÃO ANDA
 *   node tests/azul-e-slots-fixos.test.js
 *
 * RELATO DO DONO (15/ago/2026, print do placar ao vivo):
 *   "o time do usuario sempre em azul. slots dos jogadores fixos. kelly era jogador 2
 *    no primeiro jogo e mudou de slot no resorteio."
 * No print: AZUL = [Kelly, Jogador 2] · VERMELHO = [Jogador 3, Rodrigo].
 * O dono é o Rodrigo — e estava jogando de vermelho, no último slot.
 *
 * ⚠️ O CÂNONE JÁ EXISTIA (v1.8.77, `_anchorUserFirst`) e estava LIGADO. Ele não faltava:
 * estava FALHANDO. Duas causas, as duas de IDENTIDADE, medidas com as funções reais:
 *
 *  (A) O `uid` do usuário só era gravado no `_playerMeta` DENTRO de
 *      `if (cu && cu.photoURL)`. Quem não tem foto de perfil nunca ganhava uid — e a
 *      âncora casa por uid primeiro. Foto é enfeite; uid é identidade, e a identidade
 *      estava pendurada no enfeite.
 *  (B) A reserva por nome exigia igualdade EXATA. Na tela o slot dele mostra "Rodrigo"
 *      e o perfil é "Rodrigo Barth" → não casava → âncora virava no-op.
 *      ⚠️ E o próprio `_playerMeta` já identificava o usuário por PRIMEIRO NOME
 *      (`pn === cu.displayName.split(' ')[0]`): as duas regras discordavam, então uma
 *      dizia "é o usuário" (e punha a foto dele) enquanto a outra dizia "não é".
 *
 * (C) SLOTS QUE ANDAM: `_renameRoles` re-rotulava por ÍNDICE todo nome que ainda fosse
 *     um rótulo padrão. Como o re-sorteio permuta os NOMES, "Jogador 3" caindo no slot 2
 *     virava "Jogador 2" — o rótulo seguia a POSIÇÃO e a pessoa parecia trocar de slot.
 *     O rótulo já acompanharia a pessoa sozinho; era a reescrita que o arrancava dela.
 *
 * INVARIANTES CONGELADOS AQUI:
 *   A. usuário identificado por uid, por nome completo E por primeiro nome;
 *   B. identificado → sempre AZUL e no slot 1, venha de onde vier;
 *   C. quem já está certo não é mexido; modo técnico (usuário fora de campo) não muda nada;
 *   D. a PARTIÇÃO (quem joga com quem) nunca muda — só o lado e a ordem interna;
 *   E. rótulo padrão GRUDA na pessoa: re-sorteio não renumera ninguém;
 *   F. "Jogador 1" nunca sobra em ninguém — aquele lugar é do usuário.
 */

const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

// ── a função REAL, extraída do store.js ──────────────────────────────────────
const STORE = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const W = {};
{
  const i = STORE.indexOf('window._anchorUserFirst = function');
  if (i < 0) throw new Error('_anchorUserFirst não encontrada em store.js');
  new Function('window', STORE.slice(i, STORE.indexOf('\n};', i) + 3))(W);
}
const anchor = W._anchorUserFirst;
const semUid = () => null;

function particao(t1, t2) {   // quem joga com quem, independente do lado/ordem
  const a = t1.slice().sort().join('|'), b = t2.slice().sort().join('|');
  return [a, b].sort().join('::');
}

// ═══════════════════════════════════════════════════════════════════════════
// A/B. O CASO DO PRINT + as formas de identificar
// ═══════════════════════════════════════════════════════════════════════════
{
  const antes1 = ['Kelly', 'Jogador 2'], antes2 = ['Jogador 3', 'Rodrigo'];
  const r = anchor(antes1, antes2, semUid, 'u-rb', 'Rodrigo Barth');
  ok(r.t1[0] === 'Rodrigo',
    'A1. O BUG DO PRINT: com "Rodrigo" na tela e "Rodrigo Barth" no perfil, ele vai pro AZUL slot 1 — vi ' + JSON.stringify(r.t1));
  ok(particao(antes1, antes2) === particao(r.t1, r.t2),
    'D1. a PARTIÇÃO não muda — trocar de lado não inventa confronto novo');
}
ok(anchor(['Kelly', 'X'], ['Y', 'Rodrigo Barth'], semUid, 'u-rb', 'Rodrigo Barth').t1[0] === 'Rodrigo Barth',
  'A2. nome completo na tela também casa');
ok(anchor(['Kelly', 'X'], ['Y', 'Apelido'], (n) => (n === 'Apelido' ? 'u-rb' : null), 'u-rb', 'Rodrigo Barth').t1[0] === 'Apelido',
  'A3. uid manda mesmo quando o nome não diz nada (apelido digitado)');
// ⚠️ o uid tem que valer SEM foto — foi a causa (A)
ok(/if \(!cu \|\| !cu\.displayName\) return;/.test(fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8')),
  'A4. o uid do usuário não depende mais de ter FOTO de perfil');

// ═══════════════════════════════════════════════════════════════════════════
// C. NÃO MEXER NO QUE JÁ ESTÁ CERTO / MODO TÉCNICO
// ═══════════════════════════════════════════════════════════════════════════
{
  const r = anchor(['Rodrigo', 'Kelly'], ['A', 'B'], semUid, 'u-rb', 'Rodrigo Barth');
  ok(r.t1.join() === 'Rodrigo,Kelly' && r.t2.join() === 'A,B', 'C1. já no azul slot 1 → não mexe em nada');
}
{
  const r = anchor(['A', 'B'], ['C', 'D'], semUid, 'u-rb', 'Rodrigo Barth');
  ok(r.t1.join() === 'A,B' && r.t2.join() === 'C,D',
    'C2. usuário fora de campo (modo técnico) → devolve como veio, sem inventar');
}
{
  // usuário no azul mas no slot 2 → sobe pro 1 sem trocar de time
  const r = anchor(['Kelly', 'Rodrigo'], ['A', 'B'], semUid, 'u-rb', 'Rodrigo Barth');
  ok(r.t1[0] === 'Rodrigo' && r.t1.indexOf('Kelly') === 1 && r.t2.join() === 'A,B',
    'C3. no azul mas no slot 2 → sobe pro slot 1, o time NÃO troca');
}

// ═══════════════════════════════════════════════════════════════════════════
// E/F. O RÓTULO GRUDA NA PESSOA (a reescrita por índice saiu)
// ═══════════════════════════════════════════════════════════════════════════
const BUI = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket-ui.js'), 'utf8');
const iRR = BUI.indexOf('var userTaken = false;');
// ⚠️ janela larga o bastante pra cobrir os DOIS times: a 1ª versão cortava em 2600 e
// parava antes do bloco do time 2 — o teste acusava um defeito que não existia.
const bloco = BUI.slice(iRR, BUI.indexOf('_dedupeTeam(t1List, true);', iRR));
ok(bloco.indexOf("if (!p1p.name) {\n          p1p.name = 'Jogador ' + (ti + 1);") !== -1,
  'E1. time 1: só preenche slot VAZIO (não renumera quem já tem rótulo)');
ok(bloco.indexOf("if (!p2p.name) p2p.name = 'Jogador '") !== -1,
  'E2. time 2: idem');
ok(bloco.indexOf("if (isDefault1) {\n          p1p.name = 'Jogador ' + (ti + 1);") === -1,
  'E3. A REESCRITA POR ÍNDICE saiu do time 1 — era ela que fazia a Kelly "mudar de slot"');
ok(bloco.indexOf('if (isDefault2) p2p.name') === -1,
  'E4. …e do time 2');
ok(bloco.indexOf("p1p.name === 'Jogador 1'") !== -1,
  'F1. "Jogador 1" continua sendo reescrito — aquele lugar é do usuário (cânone)');
// o isDefault1 SOBREVIVE: é ele que autoriza trocar o rótulo pelo nome real do usuário
ok(bloco.indexOf('if (isDefault1 && cu && cu.displayName)') !== -1,
  'F2. o rótulo padrão continua podendo virar o NOME REAL do usuário');
ok(bloco.indexOf('var isDefault2') === -1,
  'F3. o `isDefault2` virou código morto com a mudança e foi removido');

// ═══════════════════════════════════════════════════════════════════════════
// Varredura: a âncora é a MESMA em todo re-sorteio (nenhum caminho escapa)
// ═══════════════════════════════════════════════════════════════════════════
{
  // 200 permutações: onde quer que o usuário caia, sai no azul slot 1 e a partição segue
  let piores = 0;
  const base = ['Rodrigo', 'Kelly', 'Ana', 'Bruno'];
  for (let s = 0; s < 200; s++) {
    const p = base.slice();
    for (let i = p.length - 1; i > 0; i--) { const j = (s * 7 + i * 13) % (i + 1); const t = p[i]; p[i] = p[j]; p[j] = t; }
    const t1 = [p[0], p[1]], t2 = [p[2], p[3]];
    const r = anchor(t1, t2, semUid, 'u-rb', 'Rodrigo Barth');
    if (r.t1[0] !== 'Rodrigo' || particao(t1, t2) !== particao(r.t1, r.t2)) piores++;
  }
  ok(piores === 0, 'G1. em 200 sorteios o usuário SEMPRE sai no azul slot 1 e a partição é preservada — falhas: ' + piores);
}

console.log('\n🔵 TIME AZUL + SLOTS FIXOS');
console.log('   ' + pass + ' ok, ' + fail + ' falhas');
if (fail) { fails.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
console.log('   ✅ tudo verde');

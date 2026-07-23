/* "SOU EU?" na classificação (verde) — node tests/classif-highlight-me.test.js
 *
 * Pedido do dono: "na classificação vamos usar a cor verde para o nome do usuário e sua
 * posição para que ele se encontre mais facilmente na classificação."
 *
 * O RISCO desta feature é casar por NOME. A classificação é indexada por nome (é o que o mapa
 * carrega), e o rótulo de dupla "A / B" é TIPOGRAFIA, não chave. Casar por substring pintaria
 * de verde a linha de OUTRA pessoa — o mesmo erro que já mordeu o "é o meu jogo?"
 * (project_uid_identity_canon_locked / project_dupla_entry_structural_not_slash).
 *
 * Aqui a resolução é: rótulo → ENTRADA do roster → comparação por UID. Este teste inclui o
 * caso venenoso real da Confra: "RODRIGO UNGER PIRES DA SILVA / Vanessa Soares" existindo na
 * mesma classificação que o Rodrigo Barth logado.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// Carrega identity-core (puro) + só o helper do store.js.
const sandbox = { window: null, console, Object: Object };
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'identity-core.js'), 'utf8'),
  sandbox, { filename: 'identity-core' });
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
const i = src.indexOf('window._classifEntryIsMe = function');
const j = src.indexOf('window._renderClassifBlock = function');
ok(i !== -1 && j > i, '_classifEntryIsMe não encontrado no store.js');
vm.runInContext(src.slice(i, j), sandbox, { filename: 'store-classif' });
const W = sandbox.window;
W._pName = function (p, fb) {
  if (!p) return fb || '';
  return p.displayName || p.name || fb || '';
};

const t = {
  id: 't1',
  participants: [
    { displayName: 'Fe Biojone / marcia andrade', p1Name: 'Fe Biojone', p1Uid: 'uFe', p2Name: 'marcia andrade', p2Uid: 'uMa' },
    // CASO VENENOSO: outro Rodrigo, nome mais longo, contém "Rodrigo".
    { displayName: 'RODRIGO UNGER PIRES DA SILVA / Vanessa Soares', p1Name: 'RODRIGO UNGER PIRES DA SILVA', p1Uid: 'uUnger', p2Name: 'Vanessa Soares', p2Uid: 'uVa' },
    { displayName: 'Monica Rossi / Rodrigo Barth', p1Name: 'Monica Rossi', p1Uid: 'uMo', p2Name: 'Rodrigo Barth', p2Uid: 'uRod' },
    { displayName: 'Solo Silva', uid: 'uSolo' },
  ],
};

function login(uid) { W.AppStore = { currentUser: uid ? { uid: uid, displayName: (uid==='uRod'?'Rodrigo Barth':'Solo Silva') } : null }; }

// ── 1. dupla onde eu sou o SEGUNDO membro ────────────────────────────────────
login('uRod');
ok(W._classifEntryIsMe(t, 'Monica Rossi / Rodrigo Barth') === true,
  'devia reconhecer a dupla onde sou o 2º membro');

// ── 2. NÃO pinta a dupla do outro Rodrigo (colisão de nome) ──────────────────
ok(W._classifEntryIsMe(t, 'RODRIGO UNGER PIRES DA SILVA / Vanessa Soares') === false,
  'REGRESSÃO: casou por NOME e pintaria a linha de OUTRA pessoa (uid é a identidade)');

// ── 3. não pinta linha de terceiros ──────────────────────────────────────────
ok(W._classifEntryIsMe(t, 'Fe Biojone / marcia andrade') === false, 'não devia casar com dupla alheia');

// ── 4. solo ──────────────────────────────────────────────────────────────────
login('uSolo');
ok(W._classifEntryIsMe(t, 'Solo Silva') === true, 'devia reconhecer entrada solo');
ok(W._classifEntryIsMe(t, 'Monica Rossi / Rodrigo Barth') === false, 'solo não pode casar com dupla alheia');

// ── 5. nome de UMA pessoa (grupo Rei/Rainha lista pessoas, não entradas) ─────
login('uRod');
ok(W._classifEntryIsMe(t, 'Rodrigo Barth') === true,
  'classificação individual (Rei/Rainha) devia resolver a pessoa por uid');
ok(W._classifEntryIsMe(t, 'Monica Rossi') === false, 'pessoa do MESMO time não é "eu"');

// ── 6. sem login / entrada vazia → nunca destaca ─────────────────────────────
login(null);
ok(W._classifEntryIsMe(t, 'Monica Rossi / Rodrigo Barth') === false, 'visitante não pode ter linha verde');
login('uRod');
ok(W._classifEntryIsMe(t, '') === false, 'nome vazio → false');
ok(W._classifEntryIsMe(null, 'Qualquer') === false, 'sem torneio → false');

console.log((fail === 0 ? '✅' : '❌') + ` classif "sou eu?" por uid: ${pass} ok, ${fail} falharam`);
process.exit(fail === 0 ? 0 : 1);

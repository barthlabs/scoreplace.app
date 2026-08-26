/* O OUVINTE DAS PARTES QUE MORAM FORA DO DOCUMENTO  (2.0.123)
 * node tests/ouvinte-das-partes-divididas.test.js
 *
 * O `onSnapshot` do app é no DOCUMENTO. Campo que saiu pra subcoleção não chega por ele —
 * precisa do próprio ouvinte. Era só pros jogos, com 'matches' escrito à mão; agora deriva
 * de `_semPesados`, que é quem sabe o que ESTE torneio guarda fora.
 *
 * ⛔ MAS NÃO OUVE TUDO, e a razão é custo: abrir o torneio já busca todas as partes. Um
 * ouvinte por parte pagaria essa leitura DE NOVO na primeira entrega (o Firestore manda tudo
 * como 'added') — no Confra, reler 148 inscritos e o histórico a cada abertura, sem que nada
 * disso mude com a tela aberta. Ouve o que muda ao vivo: jogos e presença.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
let falhas = 0;
const ok = (n, c, extra) => { if (c) console.log('  ✓ ' + n); else { console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); falhas++; } };

console.log('──── o ouvinte das partes divididas ────');

const i = src.indexOf('ouvirPartesDoTorneio(tournamentId) {');
ok('o ouvinte genérico existe', i > 0);
const corpo = src.slice(i, src.indexOf('\n  pararDeOuvirJogos()', i));

ok('⛔ deriva de `_semPesados`, não de um nome escrito à mão',
  /_semPesados/.test(corpo) && !/colecaoDaParte\('matches'\)/.test(corpo),
  'com o nome fixo, a parte seguinte a sair do documento nunca chegaria na tela');
ok('⭐ e cruza com o que muda AO VIVO (custo: a abertura já buscou tudo)',
  /_partesQueMudamAoVivo\(\)\.filter/.test(corpo));
ok('  → torneio inteiro sai cedo, sem assinar nada', /if \(!fora\.length\) return;/.test(corpo));
ok('  → e sem alvo também', /if \(!alvos\.length\) return;/.test(corpo));

ok('⭐ usa o DELTA (`docChanges`), não o snapshot inteiro', /snap\.docChanges\(\)\.length/.test(corpo));
ok('⛔ parte VAZIA esvazia de verdade — `remontar` nunca apaga, e pra um ouvinte isso é errado',
  /if \(!regs\.length\)/.test(corpo) && /vivo\[nome\] = Array\.isArray\(vivo\[nome\]\) \? \[\] : \{\}/.test(corpo),
  'sem isto, apagar a última presença deixaria a marca na tela pra sempre');
ok('⭐ escreve NO LUGAR (as telas guardam o objeto)',
  /Object\.keys\(montado\)\.forEach/.test(corpo));
ok('  → e repinta depois', /_softRefreshView/.test(corpo));
ok('  → `_faltamPesados` só some quando quem chegou foram os JOGOS',
  /if \(nome === 'matches'\) delete vivo\._faltamPesados;/.test(corpo),
  'apagar a marca quando chega a presença diria que os jogos chegaram — e eles podem não ter');

// ── soltar TODAS as assinaturas ───────────────────────────────────────────────
const iP = src.indexOf('  pararDeOuvirJogos() {');
const parar = src.slice(iP, src.indexOf('\n  },', iP));
ok('⛔ solta TODAS as assinaturas, não só a primeira',
  /Array\.isArray\(sub\.uns\)/.test(parar) && /lista\.forEach/.test(parar),
  'são várias agora (uma por parte); soltar só uma é o mesmo vazamento com cara de conserto');
ok('  → e continua aceitando a forma antiga de uma assinatura só',
  /typeof sub\.un === 'function'/.test(parar));

// ── o nome velho segue funcionando (o router chama por ele) ──────────────────
ok('⭐ `ouvirJogosDoTorneio` continua existindo e delega',
  /ouvirJogosDoTorneio\(tournamentId\) \{ return this\.ouvirPartesDoTorneio\(tournamentId\); \}/.test(src),
  'o router chama por esse nome; renomear sem alias apagaria o ouvinte inteiro em silêncio');
const rt = fs.readFileSync(path.join(ROOT, 'js/router.js'), 'utf8');
ok('  → e o router segue soltando ao sair da rota', /pararDeOuvirJogos\(\)/.test(rt));

// ── a regra do banco tem que deixar LER, senão a tela abre sem o dado ────────
const rules = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
['checkedIn', 'woClaims', 'woLog', 'inscritos', 'matches'].forEach((c) => {
  const m = rules.indexOf('match /' + c + '/{');
  ok('⛔ há regra de LEITURA para `' + c + '` (sem ela o Firestore nega por omissão)', m > 0);
  if (m > 0) {
    const bloco = rules.slice(m, rules.indexOf('\n      }', m));
    ok('  → e a escrita do cliente é NEGADA (quem escreve é a porta na CF)',
      /allow write: if false;/.test(bloco) || c === 'matches',
      'deixar o cliente escrever aqui contornaria a tabela de permissão inteira');
  }
});

console.log(falhas === 0 ? '\n✅ ouvinte-das-partes-divididas: OK' : '\n❌ ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);

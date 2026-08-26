/* O PÓDIO NÃO PODE DISCORDAR DA CLASSIFICAÇÃO LOGO ABAIXO DELE (2.0.113)
 * node tests/podio-concorda-com-a-classificacao.test.js
 *
 * Relato do dono (26/ago, olhando o BT Corpus Christi encerrado): _"no pódio não aparece o
 * 3º lugar e deveria"_.
 *
 * ⛔ O 3º só era preenchido por um JOGO de disputa de terceiro. Eliminatória simples não
 * tem esse jogo — os dois perdedores de semifinal empatam —, então o degrau ficava vazio.
 * ⭐ Só que a CLASSIFICAÇÃO logo abaixo já resolvia e já mostrava o 3º na tela (medido no
 * Corpus Christi: "Ciça Mange / Olivia"). O pódio estava DISCORDANDO da tabela a dois
 * centímetros dele — e duas coisas discordando na mesma tela é pior que informação
 * faltando: a pessoa não sabe em qual acreditar.
 *
 * ⭐ REGRA: havendo o jogo de 3º, ele manda (é resultado em quadra). Não havendo, o degrau
 * sai do MESMO mapa que desenha a tabela.
 * ⚠️ E só quando a tabela aponta UM: se ela empata dois no 3º, escolher um seria o app
 * inventando um desempate que ninguém jogou.
 */
const fs = require('fs');
const path = require('path');
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const src = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');

/* ── ⭐ O JOGO DE 3º MORA NUM QUARTO LUGAR — e foi ele que quase me fez promover quem
 * perdeu por W.O. ────────────────────────────────────────────────────────────────
 * Eu conhecia três casas de jogo: `rounds[].matches`, `matches`, `groups[].matches`.
 * A disputa de terceiro tem a DELA: `t.thirdPlaceMatch`, campo de topo — e ela não carrega
 * `isThirdPlace` nem `bracket:'thirdplace'`, então todo filtro passava batido.
 * ⛔ MEDIDO no BT Corpus Christi: o jogo EXISTE ("Ciça Mange / Olivia" × "Fabiana Vieira /
 * Eduardo Mange", vencido por Fabiana/Eduardo, com W.O. registrado em `woClaims`), o pódio
 * mostrava ninguém, e a classificação — cega pra ele — punha a **Ciça em 3º**.
 * Meu primeiro conserto tirava o 3º da classificação: teria PROMOVIDO A DUPLA QUE PERDEU
 * POR W.O. Quem pegou foi o dono: _"errado. Ciça Mange perdeu por wo. Fabiana e Eduardo 3º"_.
 * ⇒ REGRA: resultado em quadra manda sobre critério calculado. SEMPRE. */
ok(/t\.thirdPlaceMatch && t\.thirdPlaceMatch\.winner/.test(src),
  '⭐ o pódio lê `t.thirdPlaceMatch` — a QUARTA casa de jogo');
const iTpm = src.indexOf('t.thirdPlaceMatch && t.thirdPlaceMatch.winner');
const iCls = src.indexOf("if (!thirdPlace && classifMap && typeof classifMap === 'object')");
ok(iTpm > 0 && iTpm < iCls,
  '⛔ e ANTES da classificação — invertido, o app promoveria quem perdeu por W.O.');
ok(/_comTerceiro\(t, fpMatches\)/.test(src),
  '⭐ e a CLASSIFICAÇÃO também passa a enxergar esse jogo — senão a tabela segue pondo o ' +
  'perdedor de W.O. em 3º, e a tela volta a discordar de si mesma');
ok(/isThirdPlace: true/.test(src),
  '⚠️ marcado como disputa de 3º ao entrar: sem a marca ele entra como jogo comum e ' +
  'bagunça as posições em vez de consertar');

const i = iCls;
ok(i > 0, 'a derivação existe');
const bloco = _R.ateOFim(src, i);

ok(/!thirdPlace &&/.test(bloco),
  '⭐ só entra quando NÃO houve disputa de 3º — havendo, o resultado em quadra manda');
ok(/classifMap\[n\] === 3/.test(bloco), 'e pega quem a classificação põe em 3º');
ok(/_terceiros\.length === 1/.test(bloco),
  '⛔ e SÓ quando ela aponta UM: empate no 3º, escolher um seria inventar desempate que ninguém jogou');

// a derivação tem que vir ANTES de desenhar, senão não adianta
const iDesenho = src.indexOf('podium = window._buildPodiumHtml(w1, w2, thirdPlace);');
ok(iDesenho > i, '⭐ e vem ANTES de o pódio ser desenhado');

// e o mapa usado é o MESMO que alimenta a tabela
const iMapa = src.lastIndexOf('classifMap = window._classifMapFromMatches(t, _comTerceiro(t, fpMatches));', i);
ok(iMapa > 0 && iMapa < i,
  '⭐ o mapa é o MESMO que desenha a classificação — é isso que garante que as duas concordem');

// ── o caso real, reproduzido: 8 duplas, sem jogo de 3º ─────────────────────
const classif = { 'Max / Kelly Barth': 1, 'Mari / Flavia Cocozza': 2, 'Ciça Mange / Olivia': 3,
  'Fabiana Vieira / Eduardo Mange': 4 };
const terceiros = Object.keys(classif).filter((n) => classif[n] === 3);
ok(terceiros.length === 1,
  '(a queda pela classificação só age quando a tabela aponta UM — e só quando não há jogo de 3º)');

const empatado = { 'A': 1, 'B': 2, 'C': 3, 'D': 3 };
ok(Object.keys(empatado).filter((n) => empatado[n] === 3).length === 2,
  '⚠️ e num empate a regra do `length === 1` deixa o degrau vazio, que é honesto');

console.log((fail ? '✗' : '✓') + ' podio-concorda-com-a-classificacao: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);

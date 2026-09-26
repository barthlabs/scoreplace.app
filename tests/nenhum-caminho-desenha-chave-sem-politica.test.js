'use strict';
/* NENHUM CAMINHO DESENHA CHAVE SEM A POLÍTICA — portão por ENUMERAÇÃO.
 * node tests/nenhum-caminho-desenha-chave-sem-politica.test.js
 *
 * ⛔⛔ ESTE ARQUIVO EXISTE PORQUE EU ERREI A MESMA COISA SEIS VEZES NA MESMA LEVA.
 *
 * O bloco 7 ensinou três desenhos de chave ao motor. A cada rodada de revisão eu "tinha terminado", e
 * a revisão achava mais um ponto que chamava o desenhador SEM a política — e um ponto sem a política
 * não falha: ele desenha repescagem em silêncio. Os seis, na ordem em que apareceram:
 *   ① `chaves-adapter` → `C.chave(N, formato)`  — o construtor principal;
 *   ② `phases-engine` → o gerador, no caminho direto;
 *   ③ `buildPhaseBrackets` — as chaves por LINHA/CATEGORIA (Ouro e Prata desenhariam repescagem);
 *   ④ `recalcularComTardio` — o tardio;
 *   ⑤ o downstream do recálculo — deixava a chave HÍBRIDA: 1ª rodada de um desenho, resto de outro;
 *   ⑥ `_buildPhase0Cfg` — **o sorteio inicial**, o mais importante de todos, e o último que eu vi.
 *
 * ⛔ A LIÇÃO NÃO É "ter mais cuidado", é ENUMERAR: quem acrescentar um caminho novo de desenhar chave
 * cai aqui em vez de descobrir em produção que a escolha do organizador não fez nada.
 * [[feedback_enumerar_todos_os_caminhos_antes_de_dar_por_pronto]]
 *
 * ⚠️ O portão é de TEXTO e olha o CÓDIGO, não o comentário: comentário que menciona a política daria
 * verde sem a política existir, que é a armadilha do falso verde que já me pegou três vezes.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── nenhum caminho desenha chave sem a política ────\n');

const semComentarios = (txt) => txt.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ── ① TODA chamada ao desenhador passa a política ─────────────────────────────
 * ⛔ A lista de CHAMADORES é enumerada do próprio código, não escrita à mão: se aparecer um sétimo
 * `C.chave(` em qualquer arquivo, ele entra na conta sozinho e o portão cobra. */
const ARQUIVOS = fs.readdirSync(path.join(ROOT, 'js', 'views'))
  .filter((f) => f.endsWith('.js'))
  .map((f) => path.join('js/views', f));

const chamadas = [];
ARQUIVOS.forEach(function (rel) {
  const codigo = semComentarios(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
  const re = /\bC\.chave\s*\(([^;]{0,200}?)\)/g;
  let m;
  while ((m = re.exec(codigo)) !== null) chamadas.push({ rel: rel, args: m[1] });
});
ok(chamadas.length >= 2, '① achei ' + chamadas.length + ' chamada(s) ao desenhador (o motor é um só)');
const semPolitica = chamadas.filter(function (c) { return !/politicaDaChave/.test(c.args); });
ok(semPolitica.length === 0,
  '① ⛔⛔ TODA chamada ao desenhador leva a política — sem ela o desenho volta a ser repescagem em silêncio' +
  (semPolitica.length ? ' · faltando em: ' + JSON.stringify(semPolitica) : ''));

/* ── ② os SEIS pontos nomeados, cada um por si ────────────────────────────────
 * ⛔ Não basta contar: cada um destes seis já esteve errado, e cada um tem de ser afirmado pelo nome.
 * Recorte pelo próprio identificador, nunca por distância fixa. */
/* ⛔⛔ RECORTE PELO PRÓXIMO LIMITE DE FUNÇÃO, NUNCA POR TAMANHO FIXO. Eu escrevi este portão com uma
 * janela de 4000 caracteres e ele ficou VERMELHO sozinho: a chamada que ele precisa ver está 110 linhas
 * depois do começo da função. Tamanho fixo não é âncora — é a terceira vez que caio nisso, e agora está
 * consertado no lugar onde eu mesmo errei. */
function bloco(rel, idPonto) {
  const txt = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const i = txt.indexOf(idPonto);
  if (i < 0) return '';
  /* o próximo `\n  function ` no mesmo nível de indentação fecha o bloco */
  const j = txt.indexOf('\n  function ', i + idPonto.length);
  return txt.slice(i, j > i ? j : txt.length);
}

const PONTOS = [
  ['js/views/chaves-adapter.js', 'function build(', '① o construtor principal'],
  ['js/views/chaves-adapter.js', 'function crescerComPrefixo(', '⑤ o downstream do recálculo do tardio'],
  ['js/views/chaves-adapter.js', 'function integrarTardiosElim(', '④ a integração do tardio'],
  ['js/views/phases-engine.js', 'function _genElimFromChaves(', '② o gerador de eliminatória'],
  ['js/views/tournaments-draw.js', 'window._buildPhase0Cfg', '⑥ o SORTEIO INICIAL (fase 0)'],
];
PONTOS.forEach(function (p) {
  const b = semComentarios(bloco(p[0], p[1]));
  ok(b.length > 100, p[2] + ': bloco achado pelo próprio identificador');
  ok(/politicaDaChave/.test(b), '⛔ ' + p[2] + ' passa a política');
});

/* ③ as chaves por LINHA/CATEGORIA: o ponto é a chamada dentro do destOrder */
const pe = semComentarios(fs.readFileSync(path.join(ROOT, 'js/views/phases-engine.js'), 'utf8'));
ok(/_genElimFromChaves\(byDest\[dest\],\s*\{[^}]*politicaDaChave/.test(pe),
  '⛔ ③ as chaves por LINHA/CATEGORIA passam a política (Ouro e Prata desenhariam repescagem sem isto)');

/* ── ③ AS FASES COMPILADAS CARREGAM A POLÍTICA ────────────────────────────────
 * ⛔ Duas fases eliminatórias nascem em pontos diferentes do compilador — a de fase única e a que vem
 * depois da classificatória. Uma sem a política faria o torneio trocar de desenho no MEIO. */
const f2 = semComentarios(fs.readFileSync(path.join(ROOT, 'js/views/format2.js'), 'utf8'));
ok((f2.match(/politicaDaChave/g) || []).length >= 2,
  '③ as DUAS fases eliminatórias do compilador carregam a política (achei ' +
  (f2.match(/politicaDaChave/g) || []).length + ')');
/* e a fase posterior tem reserva no documento do torneio, para torneio compilado ANTES desta leva */
ok(/politicaDaChave:\s*\(cfg && cfg\.politicaDaChave\) \|\| t\.politicaDaChave/.test(pe),
  '③ ⭐ e a fase POSTERIOR tem reserva no torneio — compilado antes desta leva não troca de desenho');

/* ── ④ O SERVIDOR RODA A MESMA CÓPIA ──────────────────────────────────────────
 * ⛔ A Cloud Function do sorteio não tem cópia própria do desenhador: ela roda o vendor. Se o vendor
 * ficar velho, o teste passa no cliente e o sorteio de verdade desenha outra coisa. */
['chaves.js', 'chaves-adapter.js', 'phases-engine.js'].forEach(function (nome) {
  const fonte = fs.readFileSync(path.join(ROOT, 'js/views', nome), 'utf8');
  const vendor = path.join(ROOT, 'functions-autodraw/vendor', nome);
  ok(fs.existsSync(vendor), '④ o vendor de ' + nome + ' existe');
  if (fs.existsSync(vendor)) {
    ok(fs.readFileSync(vendor, 'utf8') === fonte,
      '④ ⛔⛔ o vendor de ' + nome + ' é IDÊNTICO à fonte — vendor velho faz o sorteio desenhar outra coisa');
  }
});

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);

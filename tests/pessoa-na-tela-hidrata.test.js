/* PESSOA NA TELA HIDRATA — nome e foto saem do PONTO ÚNICO, nunca congelados no render.
 *
 * Relato do dono (22/ago/2026), vendo os co-organizadores como círculos vazios e sem nome:
 *   _"agora a merda do ícone/foto nos organizadores. pode corrigir em todos os lugares de
 *    uma vez caralho. já é o terceiro lugar que temos que parar e corrigir"_
 *   _"e nem nome dos organizadores aqui porra"_
 *
 * Ele está certo sobre o padrão: a CURA já existia e o defeito voltava porque cada tela
 * precisava LEMBRAR de emitir os marcadores. Foram três: a chave (1.9.113), o rótulo de
 * papel ("Co-organizador(a)"), e agora o card de organização inteiro.
 *
 * A DOENÇA: desde a 1.7.79 a lista nasce do UID, e quem tem perfil ainda não resolvido nasce
 * com o nome VAZIO de propósito. Duas consequências, e as duas apareceram na tela:
 *   · o NOME escrito no HTML congela vazio — a tela não se redesenha só porque um perfil
 *     chegou depois;
 *   · o ÍCONE é semeado pelo NOME, e seed vazia devolve o MESMO círculo mudo pra todo mundo.
 *     Não é um ícone genérico: é a ausência de nome virando desenho.
 *
 * A CURA (`_hydrateUidNames`, store.js) preenche `[data-uid-name]`, `[data-uid-role]` e
 * `[data-uid-avatar]` quando o perfil chega. Este teste guarda o PONTO ÚNICO que emite
 * esses marcadores e cobra que os cards de pessoa passem por ele — pra não existir um
 * quarto lugar.
 */
const fs = require('fs');
const path = require('path');
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) { console.log('  ✓ ' + nome); return; }
  console.log('  ✗ ' + nome + (extra ? '\n      ' + extra : '')); falhas++;
};
const ler = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');

console.log('──── pessoa na tela hidrata (nome + foto pelo ponto único) ────');

const store = ler('js/store.js');
const tourn = ler('js/views/tournaments.js');

// ── O PONTO ÚNICO existe e tem a regra dentro ────────────────────────────────────────
ok('existe o ponto único do avatar de pessoa (_personAvatarHtml)',
  /window\._personAvatarHtml = function/.test(store));
ok('existe o ponto único do nome de pessoa (_personNameHtml)',
  /window\._personNameHtml = function/.test(store));
ok('⛔ com uid e nome ainda não resolvido NÃO se pede ícone (seed vazia = círculo mudo)',
  /var semNomeAinda = !nm && !!uid;[\s\S]{0,900}var src = semNomeAinda \? '' :/.test(store));
ok('o uid viaja no próprio <img>, pra hidratação achá-lo',
  /_personAvatarHtml[\s\S]{0,1200}data-uid-avatar="/.test(store));
ok('e no <span> do nome',
  /_personNameHtml[\s\S]{0,700}data-uid-name="/.test(store));
// O encolhedor de nome lê data-maxrem/minrem do próprio span: um helper que os perdesse
// trocaria um defeito por outro (nome vazando da caixa).
ok('o helper do nome repassa atributos extras (o .sp-name-fit precisa dos seus)',
  /window\._personNameHtml = function \(uid, name, css, cls, extraAttrs\)/.test(store) &&
  /\(extraAttrs \|\| ''\) \+/.test(store));

// ── A HIDRATAÇÃO cobre os três marcadores ────────────────────────────────────────────
['data-uid-name', 'data-uid-role', 'data-uid-avatar'].forEach((attr) => {
  ok('_hydrateUidNames varre [' + attr + ']',
    new RegExp('_hydrateUidNames[\\s\\S]{0,2000}querySelectorAll\\(\'\\[' + attr + '\\]\'\\)').test(store));
});

// ── OS CARDS DE ORGANIZAÇÃO passam pelo ponto único ──────────────────────────────────
// Foi exatamente aqui que a doença reapareceu pela terceira vez.
function corpoDaFuncao(src, nome) {
  const i = src.indexOf('function ' + nome + '(');
  if (i < 0) return null;
  const j = src.indexOf('\n        }', i);          // fim do bloco no nível de indentação
  return j > i ? src.slice(i, j) : _R.ateOFim(src, i);
}
['_buildOrgCard', '_buildPendingOrgCard'].forEach((fn) => {
  const corpo = corpoDaFuncao(tourn, fn);
  ok(fn + ' existe', !!corpo);
  ok('  → ' + fn + ' desenha o avatar pelo ponto único',
    !!corpo && /window\._personAvatarHtml\(/.test(corpo),
    'sem isso o círculo nasce mudo e nada o cura depois');
  ok('  → ' + fn + ' desenha o nome pelo ponto único',
    !!corpo && /window\._personNameHtml\(/.test(corpo),
    'sem isso o nome congela vazio no render');
  // ⛔ E não pode sobrar o caminho velho dentro da MESMA função: um <img> semeado por nome
  // convive com o novo sem dar erro, e a tela volta a mostrar círculo mudo em silêncio.
  ok('  → ' + fn + ' não tem mais <img> semeado pelo NOME',
    !!corpo && !/<img src="' \+ _oPhoto/.test(corpo),
    'sobrou o avatar antigo (seed pelo nome) — é o que produzia o círculo igual pra todos');
});

// O card ativo tinha um ciclo de layout: o fit diminuía a fonte e o pai
// `flex:0 1 auto` diminuía junto, disparando novo ResizeObserver. A caixa do nome deve
// ter largura estável, senão o texto vibra e pode terminar truncado.
const orgCard = corpoDaFuncao(tourn, '_buildOrgCard') || '';
ok('o nome do organizador mede uma caixa estável (não flex:auto)',
  /class="sp-org-name-row"[\s\S]{0,220}width:min\(100%,12rem\)/.test(orgCard) &&
  /class="sp-org-name-box"[\s\S]{0,120}flex:1;min-width:0/.test(orgCard),
  'sem caixa estável, fonte e largura se realimentam e o nome vibra');
ok('o caminho instável flex:0 1 auto saiu do nome do organizador',
  !/flex:0 1 auto;min-width:0;height:1\.15rem/.test(orgCard));
ok('a estrela é parte visual do nome, não uma coluna solta do card',
  /sp-name-fit sp-org-name-fit/.test(orgCard) && !/var _starSpan/.test(orgCard),
  'o nome e a estrela precisam viajar juntos depois da hidratação');
const css = ler('css/components.css');
ok('a estrela do organizador fica à direita do nome com pequena folga',
  /\.sp-org-name-fit::after\{content:'★';[\s\S]{0,120}margin-left:0\.25rem/.test(css));

console.log(falhas === 0
  ? '\n✅ pessoa-na-tela-hidrata: OK'
  : '\n❌ pessoa-na-tela-hidrata: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);

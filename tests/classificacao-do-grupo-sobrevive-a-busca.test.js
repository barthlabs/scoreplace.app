/* A CLASSIFICAÇÃO DO GRUPO SOBREVIVE À BUSCA
 *
 * Relato do dono (24/ago/2026): _"quando filtramos o nome lucia nas chaves o grupo F não
 * aparece a classificação do grupo (e deveria aparecer)"_.
 *
 * POR QUE SUMIA: o filtro das chaves (`_bracketApplyFilter`) esconde todo container que
 * ficou sem nenhum `[data-players]` casando — regra certa, é ela que faz o box de um grupo
 * sem ninguém buscado sair da tela. Só que a LINHA da classificação de quem levou W.O.
 * também declara `data-players` (v1.6.86/22-ago, pra que buscar quem saiu ache o grupo).
 * Buscar OUTRA pessoa do mesmo grupo escondia essa linha, e ela era o único `[data-players]`
 * dentro do bloco "📊 Classificação do grupo" → o bloco INTEIRO sumia. O grupo F era o
 * único com W.O.; por isso só ele perdia a tabela.
 *
 * A CORREÇÃO: linha de classificação e pílula de W.O. são MARCADOR (`data-fb-marker="1"`),
 * não card. Marcador declara ("essa pessoa é deste grupo") e nunca se esconde — só empurra
 * "tem gente aqui" pros ancestrais quando casa. Assim o grupo continua sendo achado pelo
 * nome de quem tomou W.O. E a tabela não volta com buraco na numeração.
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── classificação do grupo sobrevive à busca ────');

const bracket = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');
const liga = fs.readFileSync(path.join(ROOT, 'js', 'views', 'liga-substitution.js'), 'utf8');

// ── 1. quem declara sem ser jogo se declara MARCADOR ────────────────────────────────
ok(/_woBuscaLinha = \(_isRed \|\| _isAmb\)[\s\S]{0,200}data-fb-marker="1"/.test(bracket),
  'a linha da classificação (W.O.) é marcador');
ok(/var s2 = '<span data-players="' \+ _woBusca \+ '" data-my-match="1" data-fb-marker="1"/.test(liga),
  'a pílula "🔁 W.O. → substituto" é marcador');
// não perder a regra anterior: o grupo tem de continuar sendo ACHADO por esses dois
ok(/_woBuscaLinha = \(_isRed \|\| _isAmb\)[\s\S]{0,200}data-players="/.test(bracket),
  'a linha continua declarando data-players (buscar quem tomou W.O. acha o grupo)');

// ── 2. o filtro respeita o marcador ─────────────────────────────────────────────────
ok(/data-fb-marker'\) === '1'\) \{\s*\n\s*if \(hit\) \{ shown\+\+; markHit/.test(bracket),
  'o filtro nunca mexe no display de um marcador');

// ── 3. o comportamento, no DOM (o caso do print: Grupo F com W.O.) ──────────────────
function mkEl(attrs, parent) {
  const el = { style: {}, dataset: {}, parentElement: parent || null, children: [],
    getAttribute: (k) => attrs[k],
    contains: function (o) { let p = o; while (p) { if (p === this) return true; p = p.parentElement; } return false; },
    querySelectorAll: function () { const out = []; (function walk(n) { n.children.forEach(c => { if (c.getAttribute('data-players') !== undefined) out.push(c); walk(c); }); })(this); return out; },
    querySelector: function () { return null; } };
  if (parent) parent.children.push(el);
  return el;
}
const root = mkEl({}, null);                                  // #view-container
const boxF = mkEl({ 'data-group-box': '1' }, root);           // Grupo F (tem W.O.)
const classif = mkEl({}, boxF);                               // 📊 Classificação do grupo
const tbody = mkEl({}, mkEl({}, classif));                    // table > tbody
const trWo = mkEl({ 'data-players': 'Nina Pereira', 'data-my-match': '1', 'data-fb-marker': '1' }, tbody);
const gridF = mkEl({}, boxF);
const cardLucia = mkEl({ 'data-players': 'Lucia Souza | Ana Paula' }, gridF);
const cardOutro = mkEl({ 'data-players': 'Bruno | Carla' }, gridF);
const boxG = mkEl({ 'data-group-box': '1' }, root);           // outro grupo, sem a Lucia
const gridG = mkEl({}, boxG);
const cardG = mkEl({ 'data-players': 'Dinho | Elza' }, gridG);

const cards = [trWo, cardLucia, cardOutro, cardG];
const empty = { style: {} }, input = { value: '' };
const sandbox = { window: null, console, document: {
  getElementById: (id) => id === 'bracket-search' ? input
    : id === 'bracket-search-empty' ? empty
    : id === 'view-container' ? root : null,
  querySelectorAll: (sel) => sel === 'details' ? [] : cards } };
sandbox.window = sandbox; vm.createContext(sandbox);
vm.runInContext(bracket.slice(bracket.indexOf('window._bracketNorm = function')), sandbox, { filename: 'bracket-filter' });
const F = sandbox.window._bracketApplyFilter;
const vis = (el) => el.style.display !== 'none';

input.value = 'lucia'; F();
ok(vis(boxF), 'busca "lucia": o box do Grupo F aparece');
ok(vis(cardLucia) && !vis(cardOutro), '  → só o jogo dela');
ok(vis(classif), '  → E A CLASSIFICAÇÃO DO GRUPO APARECE  ← era o bug');
ok(vis(trWo), '  → com a linha do W.O. no lugar (tabela sem buraco na numeração)');
ok(!vis(boxG), '  → o grupo sem ela continua sumindo');

input.value = 'nina'; F();
ok(vis(boxF) && vis(classif), 'busca "nina" (quem tomou W.O.): ainda acha o grupo dela');
ok(!vis(cardLucia) && !vis(cardOutro), '  → sem jogos casando, os cards somem');
ok(empty.style.display === 'none', '  → e NÃO diz "nenhum resultado" (achou o grupo)');

input.value = 'zzz'; F();
ok(!vis(boxF) && !vis(boxG), 'busca sem ninguém: os dois boxes somem');
ok(empty.style.display === 'block', '  → e o "nenhum resultado" aparece');

input.value = ''; F();
ok(vis(boxF) && vis(boxG) && vis(classif) && vis(cardLucia) && vis(cardOutro) && vis(cardG),
  'busca limpa: tudo volta');

console.log(fail === 0
  ? '\n✅ classificacao-do-grupo-sobrevive-a-busca: OK (' + pass + ')'
  : '\n❌ classificacao-do-grupo-sobrevive-a-busca: ' + fail + ' falha(s)');
process.exit(fail === 0 ? 0 : 1);

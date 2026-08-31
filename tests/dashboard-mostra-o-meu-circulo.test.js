/* A DASHBOARD MOSTRA O MEU CÍRCULO — E O EXPLORAR MOSTRA TUDO (2.0.96)
 * node tests/dashboard-mostra-o-meu-circulo.test.js
 *
 * Ordem do dono (25/ago/2026): _"apenas torneios organizados ou participando, ou em locais
 * favoritos, ou de amigos. por enquanto é isso. um botão explorar mostraria tudo o que
 * existe na plataforma"_ · _"se entrar com convite, mesmo que não tenha nada disso,
 * aparece"_ · _"e continua podendo ocultar os torneios"_ · _"na dashboard deve aparecer o
 * número total de torneios na plataforma"_.
 *
 * ⛔ MODALIDADE FAVORITA FICOU DE FORA, e foram os NÚMEROS que decidiram: a régua com
 * modalidade mostrava 35 de 39 e trazia de volta 31 dos 36 torneios que o dono já tinha
 * ocultado à mão — porque 34 dos 39 são Beach Tennis, a modalidade preferida dele.
 * "Modalidade favorita" hoje é quase "tudo"; ela é filtro DENTRO do Explorar.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// carrega só a régua, do arquivo real (sem DOM)
const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
const ini = src.indexOf('function _dashLocaisFavoritos()');
const fim = src.indexOf('function _persistDashSport(');
ok(ini > 0 && fim > ini, 'achei o bloco da régua no dashboard.js');
const sandbox = { window: {}, console };
sandbox.window.AppStore = { currentUser: null, _invitedTournamentIds: [] };
vm.createContext(sandbox);
vm.runInContext(src.slice(ini, fim), sandbox, { filename: 'regua' });
const circulo = sandbox.window._ehDoMeuCirculo;
ok(typeof circulo === 'function', 'a régua está exposta como window._ehDoMeuCirculo');

const EU = 'eu';
sandbox.window.AppStore.currentUser = {
  uid: EU,
  preferredLocations: [{ label: 'Clube Paineiras do Morumby — Av. Dr. Alberto Penteado, 60' }],
  preferredSports: ['Beach Tennis'],
  friends: ['amigo1', { uid: 'amigo2' }]
};

const t = (o) => Object.assign({ id: 'x', sport: 'Beach Tennis' }, o);

// ── ENTRA ────────────────────────────────────────────────────────────────────
ok(circulo(t({ creatorUid: EU })), 'organizo → entra');
ok(circulo(t({ memberUids: ['outro', EU] })), 'participo → entra');
ok(circulo(t({ coHosts: [{ uid: EU }] })), 'co-organizo → entra');
ok(circulo(t({ creatorUid: 'amigo1' })), 'criado por amigo (uid solto) → entra');
ok(circulo(t({ creatorUid: 'amigo2' })), 'criado por amigo (objeto com uid) → entra');
// o local vem escrito diferente nos dois lados — é o caso real, e casar cru dava ZERO
ok(circulo(t({ creatorUid: 'estranho', venueName: 'Clube Paineiras do Morumby, São Paulo' })),
  'em local favorito → entra (o perfil grava "— Av. …" e o torneio grava ", São Paulo")');

// ── NÃO ENTRA ────────────────────────────────────────────────────────────────
ok(!circulo(t({ creatorUid: 'estranho', venueName: 'Arena Qualquer, Fortaleza' })),
  'de estranho, em local que não é meu → NÃO entra, mesmo sendo da minha modalidade');
ok(!circulo(t({ creatorUid: 'estranho' })), 'de estranho e sem local → NÃO entra');
ok(!circulo(t({ creatorUid: 'estranho', sport: 'Beach Tennis' })),
  '⛔ modalidade favorita NÃO é passe de entrada (era o que trazia de volta 31 dos 36 ocultados)');

// ── CONVITE PASSA POR CIMA DE TUDO ───────────────────────────────────────────
sandbox.window.AppStore._invitedTournamentIds = ['conv1'];
ok(circulo(t({ id: 'conv1', creatorUid: 'estranho', venueName: 'Arena Qualquer', sport: 'Padel' })),
  'quem chegou por CONVITE vê o torneio, mesmo sem nada em comum');

// ── deslogado vê a plataforma (não tem círculo) ──────────────────────────────
sandbox.window.AppStore.currentUser = null;
ok(circulo(t({ creatorUid: 'estranho' })), 'deslogado não tem círculo: vê tudo');

// ── a tela: pill do círculo + pill Explorar com o TOTAL ──────────────────────
// ⛔ 2.1.13 — o pill "Pra Você" saiu da tela com o resto da seção de números (ordem do
// dono: "elimine essa sessao"). A régua do CÍRCULO — que é o que este arquivo protege —
// não foi tocada: ela segue cortando a lista e o contador segue sendo calculado.
ok(!/const _circuloCount = /.test(src),
  '⛔ o contador do círculo saiu junto com a pílula que era seu único consumidor');
// 2.1.23: o pill voltou (ordem do dono), agora compacto — ver a nota em
// tests/filtros-varrem-a-plataforma.test.js. O que este arquivo guarda é a RÉGUA do
// círculo, que não mudou.
/* ⛔ 2.1.67 — a pílula "Pra Você" saiu por ordem do dono, e com ela o `_circuloCount`.
 * A RÉGUA, que é o que este arquivo guarda, continua viva: ela define a LISTA PADRÃO. */
ok(/filtered = filtered\.filter\(function \(t\) \{ return window\._ehDoMeuCirculo\(t, _ctxCirc\); \}\);/.test(src),
  '⭐ e a régua segue definindo a lista PADRÃO da dashboard (é o que importa, não a pílula)');
// O Explorar é BOTÃO ao lado do toggle "Lista" (ordem do dono: "explorar ao lado do
// toggle lista"), não um pill de filtro.
// ⚠️ 2.1.10 — ELE DEIXOU DE ALTERNAR O FILTRO E PASSOU A ABRIR UMA TELA. Esta asserção
// cobrava o comportamento antigo (`_applyDashFilter('explorar')`), e a troca é DELIBERADA,
// pedida pelo dono: _"esse botao explorar deveria abrir um tela com todos, absolutamente
// todos os torneios"_, depois de constatar que _"como está é absolutamente inutil que nao
// mostra nada alem do que ja esta na tela"_. Ele estava certo — o modo relia o pool da
// própria dashboard (publicDiscovery), que trazia 3 num banco com 39 públicos. A tela nova
// (#todos-torneios) busca direto o resumo; ver tests/todos-os-torneios-da-plataforma.js.
ok(/hash = '#todos-torneios'/.test(src),
  'o botão Explorar ABRE a tela de todos os torneios (não alterna mais o filtro da lista)');
ok(!/_applyDashFilter\('\$\{_explorando/.test(src),
  'e o modo antigo de alternar o filtro não voltou junto');
// ⛔ 2.1.11 — O NÚMERO SAIU DO POOL DA DASHBOARD. Esta asserção cobrava `${_todosCount}`,
// que conta `_poolPlataforma` — e era FALSO: 39 públicos no banco, o pill dizia 3. Ordem do
// dono: _"tira a porra do 3. coloca o numero total ali ou deixa sem numero se nao for
// possivel"_. Agora vem do total que a tela #todos-torneios apurou e guardou; sem esse
// valor, o pill fica SEM número — que é um estado legítimo, não um bug.
ok(/\$\{_totalPlataformaHtml\}/.test(src),
  'o número do Explorar vem do total apurado pela tela, não do pool da dashboard');
ok(/scoreplace_totalPlataforma/.test(src),
  'e é lido do total guardado (sem ele, o pill não mostra número nenhum)');
ok(!/_todosCount\}<\/span>/.test(src),
  '⛔ o contador do pool (que dizia 3) não voltou pro botão');
// 2.1.23: quem ocupa a sobra da linha agora é a FAIXA DE FILTROS (que rola na horizontal),
// então o Explorar deixou de precisar do `margin-right:auto` — ele é o primeiro item fixo.
ok(/flex:0 0 auto;display:inline-flex[\s\S]{0,900}filterExplore/.test(src),
  'o Explorar segue na mesma linha, como item fixo antes da faixa de filtros');
ok(/const _explorando = \(curFilter === 'explorar'\)/.test(src), 'existe o modo explorar');
ok(/if \(!_explorando\) \{[\s\S]{0,400}_ehDoMeuCirculo/.test(src),
  'a régua só corta FORA do explorar');
// ocultar continua valendo
ok(/_poolVisivel/.test(src) && /Torneios ocultados|_hidSet/.test(src),
  'ocultar segue valendo por cima do círculo (ordem do dono)');
// e os pills explícitos não são cortados
const bloco = src.slice(src.indexOf("if (curFilter === 'organizados')"), src.indexOf("// Apply secondary filters"));
ok(!/_ehDoMeuCirculo/.test(bloco.slice(0, bloco.indexOf('} else {'))),
  'os pills explícitos (organizados/participando/favoritos/encerrados) NÃO são cortados pela régua');

console.log((fail ? '✗' : '✓') + ' dashboard-mostra-o-meu-circulo: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);

/* ENTRAR NO TORNEIO CAI NO MEU GRUPO — e não no topo da página.
 *
 * Ordem do dono (21/ago/2026): "quando a pessoa entra nos detalhes do torneio ela precisa ir
 * direto para o topo do seu grupo. o seu grupo e seu nome deve estar na tela de cara."
 *
 * O QUE FALHAVA: o alvo da rolagem de entrada era o JOGO da pessoa
 * ([data-my-pending] / [data-my-match]), subindo pro box do grupo só quando o card morava
 * dentro de um. Sem jogo pendente — grupo sorteado e ainda sem confronto, rodada já jogada,
 * W.O. — não havia alvo nenhum e a tela ficava no topo do torneio. E no render Rei/Rainha
 * (_renderMonarchStage) o grupo do usuário sequer se ANUNCIAVA: sem badge, sem borda, sem
 * marca no DOM — só ia pro topo da lista.
 *
 * Duas metades, as duas cobertas aqui:
 *   1) o RENDER marca o grupo de quem está olhando com data-my-group="1";
 *   2) o ALVO da rolagem (window._bracketEntryTarget) prefere esse grupo.
 */
const H = require('./render-harness');
const W = H.window;
const buildViaDraw = H.buildViaDraw, hydrateGroups = H.hydrateGroups, hydrateMonarchGroups = H.hydrateMonarchGroups;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

console.log('\n──── entrar-no-torneio-cai-no-meu-grupo ────');

// ── 1. RENDER: Fase de Grupos marca o grupo do usuário logado ────────────────
(function () {
  const t = hydrateGroups(buildViaDraw('Fase de Grupos + Eliminatórias', 16));
  t.currentStage = 'groups';
  // "eu" sou o J7 — participante de um dos grupos.
  const eu = { uid: 'u7', displayName: 'J7', email: 'j7@x.com' };
  W.AppStore.currentUser = eu;
  const html = W.renderGroupStage(t, false, false) || '';

  const marcas = (html.match(/data-my-group="1"/g) || []).length;
  ok(marcas === 1, 'Fase de Grupos: exatamente 1 box marcado como MEU grupo (got ' + marcas + ')');
  ok(/SEU GRUPO/.test(html), 'o box do usuário se anuncia com o selo SEU GRUPO');

  // o box marcado é MESMO o que contém o nome dele (e não outro qualquer)
  const i = html.indexOf('data-my-group="1"');
  const fim = html.indexOf('data-group-box="1"', i + 10);
  const box = html.slice(i, fim > i ? fim : html.length);
  ok(box.indexOf('J7') !== -1, 'o box marcado é o que tem o nome do usuário dentro');

  // visitante (ninguém logado) → nenhum grupo é "meu"
  W.AppStore.currentUser = null;
  const htmlAnon = W.renderGroupStage(t, false, false) || '';
  ok((htmlAnon.match(/data-my-group="1"/g) || []).length === 0, 'visitante deslogado: nenhum box marcado');
})();

// ── 2. RENDER: Rei/Rainha (o formato da Confra) também marca ─────────────────
(function () {
  const t = hydrateMonarchGroups(buildViaDraw('Liga', 8, { drawMode: 'rei_rainha', ligaRoundFormat: 'rei_rainha', teamSize: 2, gruposCount: 1 }));
  if (!t.groups || !t.groups.length) { console.log('  (sem grupos monarca no fixture — trecho pulado)'); return; }
  const nome = (t.groups[0].players || [])[0];
  W.AppStore.currentUser = { uid: 'u1', displayName: nome, email: 'x@x.com' };
  const html = (typeof W._renderMonarchStage === 'function') ? (W._renderMonarchStage(t, false, false) || '') : '';
  if (!html) { console.log('  (_renderMonarchStage não exposto — trecho pulado)'); return; }
  ok(/data-my-group="1"/.test(html), 'Rei/Rainha: o grupo do usuário é marcado (antes NÃO era)');
  ok(/SEU GRUPO/.test(html), 'Rei/Rainha: selo SEU GRUPO no cabeçalho (antes não existia aqui)');
  W.AppStore.currentUser = null;
})();

// ── 3. A REGRA DE PRIORIDADE do alvo de entrada ──────────────────────────────
// DOM de mentira: cada "elemento" declara o que tem dentro. O que importa é QUAL é escolhido.
function mkEl(id, dentro) {
  return {
    _id: id,
    querySelector: function (sel) { return (dentro || []).indexOf(sel) >= 0 ? mkEl(id + '/' + sel) : null; },
    closest: function () { return null; }
  };
}
// Instala um document falso; devolve uma função que restaura o de verdade.
function comDom(mapa, grupoPedido) {
  const docAntigo = W.document, ssAntigo = W.sessionStorage;
  W.document = {
    getElementById: function (id) { return mapa['#' + id] || null; },
    querySelector: function (sel) { const v = mapa[sel]; return Array.isArray(v) ? (v[0] || null) : (v || null); },
    querySelectorAll: function (sel) { const v = mapa[sel]; return Array.isArray(v) ? v : (v ? [v] : []); }
  };
  W.sessionStorage = { getItem: function () { return grupoPedido || null; }, setItem: function () {}, removeItem: function () {} };
  return function () { W.document = docAntigo; W.sessionStorage = ssAntigo; };
}

ok(typeof W._bracketEntryTarget === 'function', 'window._bracketEntryTarget existe');

// (a) O CASO DO DONO: tenho grupo, NÃO tenho jogo pendente → vai pro meu grupo mesmo assim.
(function () {
  const meu = mkEl('meu-grupo');
  const restore = comDom({ '[data-my-group="1"]': [meu] });
  const alvo = W._bracketEntryTarget();
  restore();
  ok(alvo && alvo._id === 'meu-grupo', 'sem jogo pendente, o alvo é o MEU GRUPO (antes: nenhum alvo)');
})();

// (b) Várias rodadas (Rei/Rainha): fica no primeiro grupo meu com jogo PENDENTE.
(function () {
  const r1 = mkEl('rodada1');                                   // já jogada
  const r2 = mkEl('rodada2', ['[data-my-pending="1"]']);        // é aqui que eu jogo agora
  const r3 = mkEl('rodada3');
  const restore = comDom({ '[data-my-group="1"]': [r1, r2, r3] });
  const alvo = W._bracketEntryTarget();
  restore();
  ok(alvo && alvo._id === 'rodada2', 'vários grupos meus: escolhe o que tem jogo pendente');
})();

// (c) Nenhum pendente entre vários grupos meus → o ÚLTIMO (rodada mais recente).
(function () {
  const r1 = mkEl('rodada1'), r2 = mkEl('rodada2'), r3 = mkEl('rodada3');
  const restore = comDom({ '[data-my-group="1"]': [r1, r2, r3] });
  const alvo = W._bracketEntryTarget();
  restore();
  ok(alvo && alvo._id === 'rodada3', 'sem pendente: fica na rodada mais recente');
})();

// (d) Sem grupo nenhum (eliminatória/chave) → o próximo jogo dele, como antes.
(function () {
  const jogo = mkEl('meu-jogo');
  const restore = comDom({ '[data-my-pending="1"]': jogo });
  const alvo = W._bracketEntryTarget();
  restore();
  ok(alvo && alvo._id === 'meu-jogo', 'sem grupos: cai no próximo jogo (regra antiga preservada)');
})();

// (e) GRUPO PEDIDO (veio da dashboard por um grupo específico) vence o meu grupo.
(function () {
  const pedido = mkEl('grupo-B'), meu = mkEl('meu-grupo');
  const restore = comDom({ '[data-group-label="B"]': pedido, '[data-my-group="1"]': [meu] }, 'B');
  const alvo = W._bracketEntryTarget();
  restore();
  ok(alvo && alvo._id === 'grupo-B', 'pedido explícito de grupo vence o "meu grupo"');
})();

// (f) Banner "🏆 Avançar" (organizador, fase fechada) continua no topo da prioridade.
(function () {
  const banner = mkEl('banner'), meu = mkEl('meu-grupo');
  const restore = comDom({ '#phase-advance-banner': banner, '[data-my-group="1"]': [meu] });
  const alvo = W._bracketEntryTarget();
  restore();
  ok(alvo && alvo._id === 'banner', 'banner de avançar fase continua sendo prioridade do organizador');
})();

// (g) Nada meu na tela → nenhum alvo (a rolagem não inventa destino).
(function () {
  const restore = comDom({});
  const alvo = W._bracketEntryTarget();
  restore();
  ok(alvo === null, 'sem nada meu na tela, não há alvo (não rola pra lugar nenhum)');
})();

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fail > 0) { console.error('❌ entrar-no-torneio-cai-no-meu-grupo FALHOU'); process.exit(1); }
console.log('✅ entrar-no-torneio-cai-no-meu-grupo: OK');

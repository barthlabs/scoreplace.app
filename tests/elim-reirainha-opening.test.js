/* Eliminatória que ABRE com rodada Rei/Rainha (v4.5.51) — node tests/elim-reirainha-opening.test.js
 *
 * Nova alternativa da fase eliminatória (project_elim_rei_rainha_opening_round): a elim começa
 * por UMA rodada Rei/Rainha (grupos de 4 sorteados) e as duplas se formam DENTRO de cada grupo,
 * pela estratégia (performance 1º+2º/3º+4º · equilíbrio 1º+4º/2º+3º), com corte de X (2 ou 4) por
 * grupo de 4. Vale nos DOIS arranjos (1.8.56): sem classificatória são 2 fases (RR + elim);
 * com classificatória são 3 (classif → RR de formação, semeada pelos classificados → elim).
 *
 * Cobre 2 camadas REAIS:
 *   (1) COMPILADOR (format2.js): openReiRainha → emite [Rei/Rainha (1 rodada), elim per_group + corte].
 *   (2) TRANSIÇÃO (phases-engine.buildEntrantsByDest scope:'per_group'): forma as duplas DENTRO de
 *       cada grupo de 4, respeitando o corte e a estratégia. É a peça que carrega a feature.
 * Ver feedback_tests_must_reproduce_real_failure.
 */
const { window, load, E } = require('./headless.js');
load('format2.js');
const F = window.FORMAT2;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── (1) COMPILADOR ───────────────────────────────────────────────────────────
function cfg(over) {
  var base = {
    disputa: 'dupla', grupos: 1, classifAtiva: false,
    eliminatoria: { ativa: true, openReiRainha: true, reiRainhaCut: 4, formacao: 'performance', linhas: 1, dupla: false, terceiro: true }
  };
  if (over) Object.assign(base, over);
  return base;
}

(function () {
  var out = F.compileToPhases(cfg(), { sport: 'Beach Tennis' });
  ok(out.phases.length === 2, '(1) openRR direto → 2 fases (RR + elim) [' + out.phases.length + ']');
  var p0 = out.phases[0], p1 = out.phases[1];
  ok(p0.reiRainha === true && p0.rounds === 1, '(1) p0 = Rei/Rainha, 1 rodada');
  ok(p0.source && p0.source.type === 'enrollment', '(1) p0 vem do enrollment');
  ok(out.topLevel.drawMode === 'rei_rainha' && out.topLevel.format === 'Liga', '(1) topLevel espelha a fase RR');
  ok(p1.source && p1.source.type === 'previous_phase' && p1.source.scope === 'per_group', '(1) p1 lê a fase anterior POR GRUPO (não flatOverall)');
  ok(p1.source.qualifyTopN === 4, '(1) corte 4 → qualifyTopN 4');
  ok(p1.fixedPairs === true && p1.pairingStrategy === 'top', '(1) p1 forma duplas por performance (top)');
  ok(p1.mapping && p1.mapping[0].rankTo === 4, '(1) mapping rankTo = corte (4)');
})();

(function () {
  var out2 = F.compileToPhases(cfg({ eliminatoria: { ativa: true, openReiRainha: true, reiRainhaCut: 2, formacao: 'equilibrio', linhas: 1 } }), { sport: 'Beach Tennis' });
  ok(out2.phases[1].source.qualifyTopN === 2, '(1) corte 2 → qualifyTopN 2');
  ok(out2.phases[1].pairingStrategy === 'balanced', '(1) equilíbrio → balanced');
  ok(out2.phases[1].mapping[0].rankTo === 2, '(1) mapping rankTo = 2');
})();

(function () {
  var direct = cfg({ eliminatoria: { ativa: true, openReiRainha: false, nome: 'Final Ouro' } });
  ok(F.compileToPhases(direct, { sport: 'Beach Tennis' }).phases[0].name === 'Final Ouro',
    '(1) eliminatória direta usa o nome escolhido');
  var opening = cfg({ eliminatoria: { ativa: true, openReiRainha: true, nome: 'Finals', reiRainhaCut: 2 } });
  var phases = F.compileToPhases(opening, { sport: 'Beach Tennis' }).phases;
  ok(phases[0].name === 'Rei/Rainha' && phases[1].name === 'Finals',
    '(1) nome livre só na eliminatória posterior à abertura Rei/Rainha');
  var withClassif = cfg({ classifAtiva: true, eliminatoria: { ativa: true, openReiRainha: true, nome: 'Decisões', reiRainhaCut: 4 } });
  phases = F.compileToPhases(withClassif, { sport: 'Beach Tennis' }).phases;
  ok(phases.length === 3 && phases[1].name === 'Rei/Rainha' && phases[2].name === 'Decisões',
    '(1) classificatória + abertura Rei/Rainha preserva o nome da eliminatória');
  withClassif.eliminatoria.openReiRainha = false;
  phases = F.compileToPhases(withClassif, { sport: 'Beach Tennis' }).phases;
  ok(phases[1].name === 'Decisões', '(1) classificatória + eliminatória direta preserva o nome');
  [' ', '', null].forEach(function (nome) {
    var c = cfg({ eliminatoria: { ativa: true, openReiRainha: true, nome: nome } });
    ok(F.compileToPhases(c, { sport: 'Beach Tennis' }).phases[1].name === 'Eliminatória',
      '(1) nome vazio usa o padrão atual');
  });
  var long = 'X'.repeat(45);
  ok(F.normalize(cfg({ eliminatoria: { ativa: true, nome: long } }), 'Beach Tennis').eliminatoria.nome.length === 40,
    '(1) nome livre é limitado a 40 caracteres');
  var saved = F.compileToPhases(opening, { sport: 'Beach Tennis' });
  var edit = F.configFromTournament({ sport: 'Beach Tennis', teamSize: 2, fmt2: saved.cfg, phases: saved.phases }, 'Beach Tennis');
  ok(edit.eliminatoria.nome === 'Finals', '(1) edição lê o nome explícito do fmt2');
  var oversized = F.configFromTournament({ sport: 'Beach Tennis', teamSize: 2,
    fmt2: { eliminatoria: { nome: '  ' + 'A'.repeat(45) + '  ' } }, phases: saved.phases }, 'Beach Tennis');
  ok(oversized.eliminatoria.nome === 'A'.repeat(40), '(1) edição aplica o mesmo limite e trim da gravação');
  var recomp = F.compileToPhases(oversized, { sport: 'Beach Tennis' });
  ok(recomp.phases.filter(function (phase) { return phase.kind === 'elimination'; })[0].name === 'A'.repeat(40),
    '(1) compilação posterior conserva exatamente as 40 letras do nome salvo');
  var legacy = F.configFromTournament({ sport: 'Beach Tennis', teamSize: 2, format: 'Eliminatórias Simples' }, 'Beach Tennis');
  ok(!legacy.eliminatoria.nome, '(1) edição legada não toma o formato projetado como nome livre');
})();

// ⚠️ ASSERÇÃO REVISADA DE PROPÓSITO (1.8.56) — o motivo fica aqui pra ninguém achar que
// afrouxei a trava. Ela exigia `openReiRainha === false` quando há classificatória, e o
// comentário dela própria dizia por quê: "com classificatória (3 fases) é PRÓXIMO PASSO".
// O passo veio. O dono cobrou pelo nome: "pode fazer uma classificatória de várias rodadas
// e depois definir que os x classificados vão fazer uma rodada inicial nas eliminatórias
// que definirá as duplas que seguem". Então o que se trava agora é o CONTRÁRIO: o toggle
// sobrevive à classificatória e compila TRÊS fases. O invariante que a asserção antiga
// defendia de verdade — "só em duplas" — segue travado logo abaixo, intacto.
(function () {
  var outC = F.normalize(cfg({ classifAtiva: true }), 'Beach Tennis');
  ok(outC.eliminatoria.openReiRainha === true,
    '(1) com classificatória → openRR SOBREVIVE (era desligado; virou fase empilhada)');
  var compC = F.compileToPhases(cfg({ classifAtiva: true }), { sport: 'Beach Tennis' });
  ok(compC.phases.length === 3,
    '(1) com classificatória → 3 fases (veio ' + compC.phases.length + ')');
  ok(compC.phases[0].formatCode !== 'elim_simples' && compC.phases[0].formatCode !== 'elim_dupla',
    '(1) fase 0 é a classificatória');
  ok(compC.phases[1].reiRainha === true && compC.phases[1].rounds === 1,
    '(1) fase 1 é a rodada de FORMAÇÃO Rei/Rainha, de 1 rodada');
  ok(compC.phases[1].source && compC.phases[1].source.type === 'previous_phase',
    '(1) a formação lê os CLASSIFICADOS da fase anterior (não a inscrição)');
  ok(compC.phases[1].pairingStrategy === 'seed',
    '(1) pool ordenado por mérito → semeia (é o que espalha as cabeças de chave)');
  ok(/^elim_/.test(compC.phases[2].formatCode),
    '(1) fase 2 é a eliminatória');
  ok(compC.phases[2].source && compC.phases[2].source.scope === 'per_group',
    '(1) a eliminatória corta POR GRUPO de 4 da formação');
  // o gating que CONTINUA valendo: Rei/Rainha de abertura é coisa de dupla
  var outI = F.normalize(cfg({ disputa: 'individual' }), 'Tênis'); // Tênis permite singles
  ok(outI.eliminatoria.openReiRainha === false, '(1) individual → openRR OFF (só duplas)');
})();

// ── (2) TRANSIÇÃO por-grupo (buildEntrantsByDest scope:'per_group') ───────────
// Grupos de 4 já RANQUEADOS (computeStandings devolve na ordem dada = classificação do grupo).
function grp(names) { return { players: names.map(function (n) { return { name: n, displayName: n }; }) }; }
var cs = function (g) { return g.players.map(function (p) { return { name: p.name, displayName: p.displayName }; }); };
var groups = [grp(['A1', 'A2', 'A3', 'A4']), grp(['B1', 'B2', 'B3', 'B4'])];
function members(team) { return (team.participants || []).map(function (m) { return m.name; }); }
function sameGroup(ns) { var pre = ns.map(function (n) { return n[0]; }); return pre.every(function (p) { return p === pre[0]; }); }

(function idsDeFaseSeguros() {
  var base = { formatCode: 'elim_simples', fixedPairs: true, grandFinal: false,
    source: { mapping: [{ dest: 'main', rankFrom: 1, rankTo: 4 }] } };
  function ids(name, prefix) {
    var phase = Object.assign({}, base, { name: name });
    var built = E.buildPhaseBrackets(groups, phase, cs, prefix);
    return (built.matches || []).map(function (match) { return match.id; });
  }
  var badName = 'Final "Ouro" \'<script>';
  var dangerous = ids(badName);
  ok(dangerous.length > 0 && dangerous.every(function (id) { return /^[A-Za-z0-9_-]+$/.test(id); }),
    '(2) nome com aspas, apóstrofo e HTML gera somente IDs seguros');
  ok(new Set(dangerous).size === dangerous.length, '(2) IDs da mesma fase permanecem únicos');
  var space = ids('Fase 1'), underscore = ids('Fase_1');
  ok(space.length && underscore.length && space[0] !== underscore[0],
    '(2) nomes distintos com espaço e underscore não colidem após codificação');
  ok(ids('Eliminatória').every(function (id) { return /^[A-Za-z0-9_-]+$/.test(id); }),
    '(2) nome acentuado também produz ID seguro');
  ok(ids('')[0].indexOf('ph-x-') === 0, '(2) nome vazio recebe prefixo seguro');
  ok(ids('Finals', 'plan-1')[0].indexOf('plan-1-') === 0 &&
     ids('Finals', 'plan-2')[0].indexOf('plan-2-') === 0 &&
     ids('Finals', 'plan-1')[0] !== ids('Finals', 'plan-2')[0],
    '(2) prefixos reais distinguem duas fases com o mesmo nome');
  ok(ids('Finals', 'bad"\'<prefix>')[0].match(/^[A-Za-z0-9_-]+$/),
    '(2) prefixo explícito malicioso também é sanitizado');
  ok(ids('A'.repeat(40))[0].match(/^[A-Za-z0-9_-]+$/),
    '(2) nome vindo do round-trip de 40 letras mantém ID seguro');
})();

(function () {
  // corte 4, performance → cada grupo vira 2 duplas: (1º+2º),(3º+4º)
  var bd = E.buildEntrantsByDest(groups, [{ dest: 'main', rankFrom: 1, rankTo: 4 }], true, cs, 'top', { scope: 'per_group' });
  ok(bd.main.length === 4, '(2) cut4/perf: 2 grupos × 2 duplas = 4 duplas [' + bd.main.length + ']');
  ok(bd.main.every(function (t) { return members(t).length === 2 && sameGroup(members(t)); }), '(2) cut4/perf: cada dupla = 2 pessoas DO MESMO grupo de 4');
  var ps = bd.main.map(function (t) { return members(t).join('+'); }).sort();
  ok(ps.indexOf('A1+A2') !== -1 && ps.indexOf('A3+A4') !== -1, '(2) cut4/perf: grupo A → (A1+A2),(A3+A4)');
})();

(function () {
  // corte 2 → só os 2 melhores de cada grupo formam 1 dupla
  var bd = E.buildEntrantsByDest(groups, [{ dest: 'main', rankFrom: 1, rankTo: 2 }], true, cs, 'top', { scope: 'per_group' });
  ok(bd.main.length === 2, '(2) cut2: 1 dupla por grupo = 2 duplas [' + bd.main.length + ']');
  var ps = bd.main.map(function (t) { return members(t).join('+'); }).sort();
  ok(ps.join(',') === 'A1+A2,B1+B2', '(2) cut2: só os 2 melhores (A1+A2, B1+B2) [' + ps.join(',') + ']');
})();

(function () {
  // corte 4, equilíbrio → 1º+4º, 2º+3º dentro do grupo
  var bd = E.buildEntrantsByDest(groups, [{ dest: 'main', rankFrom: 1, rankTo: 4 }], true, cs, 'balanced', { scope: 'per_group' });
  var ps = bd.main.map(function (t) { return members(t).join('+'); }).sort();
  ok(ps.indexOf('A1+A4') !== -1 && ps.indexOf('A2+A3') !== -1, '(2) cut4/equil: grupo A → (A1+A4),(A2+A3) [' + ps.join(',') + ']');
})();

// ── (3) A TELA OFERECE A OPÇÃO NO INÍCIO DA ELIMINATÓRIA ───────────────────────
// Um único controle atende os dois arranjos; o contexto informa a origem dos atletas.
(function () {
  var fs = require('fs'), path = require('path');
  var ui = fs.readFileSync(path.join(__dirname, '../js/views/format2-ui.js'), 'utf8');
  ok(/function _blocoAbrirComRR\s*\(/.test(ui), '(3) existe UM bloco único _blocoAbrirComRR');
  var usos = (ui.match(/_blocoAbrirComRR\(/g) || []).length;
  ok(usos === 2, '(3) uma definição e uma chamada para os dois contextos (ocorrências: ' + usos + ')');
  var elimStart = ui.indexOf('if (e.ativa) {');
  var control = ui.indexOf('_blocoAbrirComRR(cfg, !!cfg.classifAtiva)', elimStart);
  var branch = ui.indexOf('if (!cfg.classifAtiva) {', elimStart);
  ok(elimStart >= 0 && control > elimStart && control < branch && /if \(isDupla\) eb \+=/.test(ui.slice(elimStart, control)),
    '(3) o controle aparece no começo de eb, antes dos ramos com/sem classificatória, só para duplas');
  ok(/var elimInner = e\.ativa \? \(eb \+/.test(ui) && /aria-disabled="true"[^\n]*\+ eb \+/.test(ui),
    '(3) o controle permanece no trecho da eliminatória bloqueado após sorteio');
  ok(/if \(!\(isDupla && cfg\.eliminatoria\.openReiRainha\)\)/.test(ui) ||
     /if \(isDupla && !cfg\.eliminatoria\.openReiRainha\)/.test(ui),
    '(3) com o toggle ON a "Estratégia da eliminatória" some (era o MESMO cfg.formacao)');
  // o texto muda conforme o contexto: com classificatória ele explica a cabeça de chave
  ok(/cabeças de chave/.test(ui), '(3) o texto do bloco explica a cabeça de chave quando há classificatória');
})();

(function () {
  var fs = require('fs'), path = require('path'), vm = require('vm');
  var H = require('./render-harness'), W = H.window;
  W._safeHtml = function (value) { return String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;'); };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../js/views/format2-ui.js'), 'utf8'), H.sandbox, { filename: 'format2-ui.js' });
  var c = W.FORMAT2.defaultConfig('Beach Tennis');
  c.classifAtiva = false;
  c.eliminatoria.nome = '<img onerror=alert(1)>';
  var form = { innerHTML: '' };
  W._f2MountInForm(form, 'Beach Tennis', c, null);
  ok(form.innerHTML.indexOf('value="&lt;img onerror=alert(1)&gt;"') >= 0,
    '(3) nome livre é escapado no input do formulário');
  ok(form.innerHTML.indexOf('Nome da fase eliminatória') >= 0 &&
     form.innerHTML.indexOf('Abrir com rodada Rei/Rainha') > form.innerHTML.indexOf('Nome da fase eliminatória'),
    '(3) nome e abertura Rei/Rainha aparecem no início da seção');
  W._f2ElimName('Final Prata');
  ok(W._f2GetConfig().eliminatoria.nome === 'Final Prata', '(3) edição do nome entra no formato salvo');
  var saved = W.FORMAT2.compileToPhases(W._f2GetConfig(), { sport: 'Beach Tennis' });
  var tournament = { id: 't1', sport: 'Beach Tennis', teamSize: 2, fmt2: saved.cfg, phases: saved.phases };
  W._f2MountInForm(form, 'Beach Tennis', tournament.fmt2, tournament);
  ok(form.innerHTML.indexOf('value="Final Prata"') >= 0, '(3) formulário de edição recupera nome explícito');
  W._renderBackHeader = function () { return ''; };
  W._findTournamentById = function () { return tournament; };
  W.location.hash = '#formato/t1';
  var page = { innerHTML: '' };
  W.renderFormatoPage(page);
  ok(page.innerHTML.indexOf('value="Final Prata"') >= 0, '(3) página de formato recupera nome explícito');
})();

(function () {
  // A fase usa o toast global ao avançar. Exercita o mesmo caminho de HTML do toast,
  // porque o nome livre não pode transformar um aviso em uma tag executável.
  var fs = require('fs'), path = require('path'), vm = require('vm');
  var source = fs.readFileSync(path.join(__dirname, '../js/notifications.js'), 'utf8');
  var start = source.indexOf('function _safeText(');
  var end = source.indexOf('// Modal de Confirmação Customizado', start);
  var container = { appendChild: function (node) { this.toast = node; },
    querySelector: function () { return null; }, querySelectorAll: function () { return []; } };
  var context = {
    window: {}, CSS: { escape: function (s) { return s; } },
    document: { getElementById: function () { return container; },
      createElement: function () { return { style: {}, setAttribute: function () {} }; } },
    requestAnimationFrame: function () {}, setTimeout: function () { return 1; },
    clearTimeout: function () {}
  };
  vm.runInNewContext(source.slice(start, end), context, { filename: 'notifications.js' });
  context.showNotification('Avançou para <img onerror=alert(1)>', 'Fase iniciada');
  ok(container.toast && container.toast.innerHTML.indexOf('&lt;img onerror=alert(1)&gt;') >= 0 &&
     container.toast.innerHTML.indexOf('<img') < 0,
    '(3) toast de avanço escapa nome livre antes de escrever innerHTML');
})();

(function () {
  // O nome compilado é texto não confiável. A chave pública o transforma em HTML
  // só depois de escapar; esta checagem impede retirar a fronteira de exibição.
  var fs = require('fs'), path = require('path');
  var bracket = fs.readFileSync(path.join(__dirname, '../js/views/bracket.js'), 'utf8');
  var dashboard = fs.readFileSync(path.join(__dirname, '../js/views/dashboard.js'), 'utf8');
  var malicious = '<img onerror=alert(1)>';
  var phase = F.compileToPhases(cfg({ eliminatoria: { ativa: true, nome: malicious } }), { sport: 'Beach Tennis' }).phases[0];
  ok(phase.name === malicious, '(3) compilador preserva o nome como dado textual');
  ok(/var phaseTitle = window\._safeHtml\(phaseCfg\.name/.test(bracket) &&
     /\+ phaseTitle \+ '<\/span>'/.test(bracket), '(3) cabeçalho público da chave escapa phase.name antes do HTML');
  ok(/_sf\(_metaStr \|\| 'Próximo jogo'\)/.test(dashboard),
    '(3) dashboard escapa o rótulo da fase na linha do próximo jogo');
})();


console.log('\n' + (fail === 0 ? '✅' : '❌') + ' elim-reirainha-opening: ' + pass + ' asserts ok, ' + fail + ' falharam');
process.exit(fail ? 1 : 0);

/* A matriz da Análise deve mostrar as categorias do torneio, nunca o catálogo
 * global A/B/C/D/FUN quando o organizador já definiu as suas.
 * node tests/analise-categorias-configuradas.test.js */
const fs = require('fs');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment-report.js'), 'utf8');
let pass = 0;
function ok(condition, message) {
  if (!condition) { console.error('✗ ' + message); process.exit(1); }
  pass++;
}

ok(source.includes('function _erAnalysisSkills(t)'), 'resolvedor único das categorias da análise existe');
ok(source.includes('t.skillCategories) ? t.skillCategories : [])'), 'categorias de habilidade do organizador têm prioridade');
ok(source.includes('t.customCategories) ? t.customCategories : [])'), 'categorias personalizadas do organizador também entram');
ok(source.includes('if (explicit.length) return explicit;'), 'configuração explícita não cai no catálogo geral');
ok(source.includes('function _erConfiguredSkills(t)') && source.includes('return inferred;'), 'torneios legados com combinedCategories preservam suas categorias');
ok(source.includes('return _DEFAULT_SKILLS.slice();'), 'A/B/C/D/FUN só é fallback sem configuração');
ok(source.includes('var skills = _erAnalysisSkills(t);'), 'a matriz consome o resolvedor, sem reconstruir A/B/C/D/FUN');
ok(source.includes('function _erConfiguredSkills(t)'), 'categorias legadas combinadas têm um resolvedor de eixos ativo');
ok(source.includes('var createdSkills = _erConfiguredSkills(t);'), 'toggles reconhecem Light/Power/Extreme já gravadas em combinedCategories');
ok(source.includes('var sc = _erConfiguredSkills(t).slice();'), 'editar um toggle não apaga as demais categorias legadas');
ok(source.includes("var configuredSkills = (typeof _erConfiguredSkills === 'function') ? _erConfiguredSkills(t) : [];") && source.includes('var skillCatsRaw = configuredSkills.length ? configuredSkills : _DEFAULT_SKILLS;'), 'parser da categoria usa o mesmo eixo efetivo — Fem Light não cai em Sem habilidade');
ok(source.includes('window._ensureTournamentLoaded(tId, function (loaded)') && source.includes("if (window.location.hash !== '#analise/' + tId) return;"), 'análise reidrata o torneio antes de acusar ausência e ignora callback após navegação');
ok(source.includes("window._callCF('applyEnrollmentAssignments'"), 'salvamento usa o transporte autenticado canônico');
ok(!source.includes("firebase.functions().httpsCallable('applyEnrollmentAssignments')"), 'análise não usa o SDK callable que perde Authorization em sessão compat');
ok(source.includes('function _erHasFinePointer()') && source.includes("'(pointer:fine)'"), 'seleção múltipla fica restrita ao ambiente desktop com ponteiro fino');
ok(source.includes('ev.metaKey || ev.ctrlKey') && source.includes('ev.shiftKey'), 'Cmd/Ctrl seleciona vários e Shift seleciona uma faixa');
ok(source.includes('var selectionClick = !canOpen ?') && source.includes('window._erMxPairClick') && source.includes('_erPairOrdersFrom'), 'cards manuais e cards de dupla entram na mesma seleção visual por Cmd/Ctrl e Shift');
ok(source.includes("var soloGrid = (femTotal || mascTotal) ?"), 'colunas Feminino/Masculino vazias não ocupam espaço entre os destinos e os inscritos sem gênero');
ok(source.includes("var assigned = Object.prototype.hasOwnProperty.call(pe, 'category')") && source.includes('var actual = _decomposeCat(assigned, t)'), 'contador superior usa a categoria atribuída efetiva — inclusive para duplas/importados sem gênero individual');
ok(source.includes('application/x-scoreplace-orders') && source.includes('orders.forEach(function (order)'), 'arrastar a seleção aplica a atribuição staged a todos os selecionados');
ok(!source.includes('window._erFormSelectedPair') && !source.includes('window._erSplitSelectedPair'), 'análise não forma nem desfaz duplas — ela só atribui gênero e categoria');
ok(!source.includes('FirestoreDB.formPair(_liveState.t.id') && !source.includes('FirestoreDB.splitPair(_liveState.t.id'), 'a análise não chama o fluxo de dupla por acidente');
console.log('✅ analise-categorias-configuradas: ' + pass + ' asserções');

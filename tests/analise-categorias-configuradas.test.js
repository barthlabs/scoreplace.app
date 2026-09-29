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
ok(source.includes("window._callCF('applyEnrollmentAssignments'"), 'salvamento usa o transporte autenticado canônico');
ok(!source.includes("firebase.functions().httpsCallable('applyEnrollmentAssignments')"), 'análise não usa o SDK callable que perde Authorization em sessão compat');
console.log('✅ analise-categorias-configuradas: ' + pass + ' asserções');

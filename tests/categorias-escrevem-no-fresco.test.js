const fs = require('fs');
const s = fs.readFileSync('js/views/tournaments-categories.js', 'utf8');
let fail = 0;
function ok(v, m) { if (v) console.log('✓ ' + m); else { fail++; console.error('✗ ' + m); } }
function body(name, next, prefix) { const a = prefix === 'window.' ? s.indexOf(prefix + name + ' = function(') : s.indexOf((prefix || 'function ') + name + '('); const b = s.indexOf(next, a); return s.slice(a, b); }
const remove = body('_executeRemoveFromCategory', 'window._moveBetweenCategories');
const move = body('_moveBetweenCategories', '// Auto-reassign', 'window.');
const assign = body('_assignParticipantCategory', '// Category assignment notification');
[['remoção', remove], ['movimentação', move], ['atribuição', assign]].forEach(([name, code]) => {
  ok(code.indexOf('AppStore.commitTournamentTx') >= 0, name + ' grava por transação fresca');
  ok(!/saveTournament\(|AppStore\.sync\(/.test(code), name + ' não regrava snapshot inteiro');
  ok(/freshParts/.test(code) && /freshP/.test(code), name + ' reencontra o participante no elenco fresco');
});
ok(/_removeKey/.test(remove) && /_moveKey/.test(move) && /_assignKey/.test(assign), 'cada ato usa uma identidade estável, nunca o índice da tela');
const merge = body('_executeMerge', '// Remove a participant');
const unmerge = body('_executeUnmerge', '// Unmerge without mergeHistory');
const inferred = body('_executeInferredUnmerge', '// Assign an uncategorized participant');
[['mesclagem', merge, '_applyCategoryMerge'], ['desfazer histórico', unmerge, '_applyCategoryUnmerge'], ['desfazer inferido', inferred, '_applyInferredCategoryUnmerge']].forEach(([name, code, apply]) => {
  ok(code.indexOf('AppStore.commitTournamentTx') >= 0 && code.indexOf(apply) >= 0, name + ' reaplica a intenção no documento fresco');
  ok(!/saveTournament\(|AppStore\.sync\(/.test(code), name + ' não regrava snapshot inteiro');
});
const autoAssign = s.slice(s.indexOf('window._autoAssignCategories = function'), s.indexOf('// Async version:', s.indexOf('window._autoAssignCategories = function')));
const hydrate = s.slice(s.indexOf('window._hydrateInlineCatMgr = function'), s.indexOf('/* ══ OS CLIQUES', s.indexOf('window._hydrateInlineCatMgr = function')));
ok(/commitTournamentTx/.test(autoAssign) && /skipPersist/.test(autoAssign) && !/saveTournament\(|AppStore\.sync\(/.test(autoAssign), 'autoatribuição reexecuta a reconciliação no documento fresco');
ok(/commitTournamentTx/.test(hydrate) && /_simplifySingletonCategories\(ft\)/.test(hydrate) && !/saveTournament\(|AppStore\.sync\(/.test(hydrate), 'normalização passiva de categorias usa documento fresco');
const resolveRequest = body('_resolveCategoryChange', 'window._approveCategoryChange');
ok(/commitTournamentTx/.test(resolveRequest) && /reqIdentity/.test(resolveRequest) && !/saveTournament\(|AppStore\.sync\(/.test(resolveRequest), 'aprovação de pedido identifica e resolve o pedido fresco');
if (fail) process.exit(1);

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
const deleteEmpty = s.slice(s.indexOf('function _applyDeleteEmptyCategory'), s.indexOf('// Unmerge a previously merged category', s.indexOf('function _applyDeleteEmptyCategory')));
ok(/return 'occupied'/.test(deleteEmpty) && /return 'played'/.test(deleteEmpty), 'exclusão mantém as proteções contra categoria ocupada ou com jogos');
ok(/_simplifySingletonCategories\(t\)/.test(deleteEmpty) && /_autoReconcileParticipantCategories\(t\)/.test(deleteEmpty), 'exclusão reaplica a reconciliação completa no documento fresco');
const deleteAction = s.slice(s.indexOf('window._deleteEmptyCategory = function'), s.indexOf('// Unmerge a previously merged category', s.indexOf('window._deleteEmptyCategory = function')));
ok(/commitTournamentTx/.test(deleteAction) && /_applyDeleteEmptyCategory\(ft, cat\)/.test(deleteAction), 'exclusão de categoria grava por transação fresca');
ok(!/saveTournament\(|AppStore\.sync\(/.test(deleteAction), 'exclusão de categoria não regrava snapshot inteiro');
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
const profileDirect = body('_applyProfileCategoryDirect', 'window._requestCategoryChangeFromProfile');
ok(/commitTournamentTx/.test(profileDirect) && /freshMe/.test(profileDirect) && !/saveTournament\(|AppStore\.sync\(/.test(profileDirect), 'categoria direta do perfil atualiza o inscrito fresco');
const requestChange = s.slice(s.indexOf('window._requestCategoryChangeFromProfile = function'), s.indexOf('// Helper interno'));
ok(/commitTournamentTx/.test(requestChange) && /changeRequest/.test(requestChange) && !/saveTournament\(|AppStore\.sync\(/.test(requestChange), 'pedido de rebaixamento é inserido no documento fresco');
if (fail) process.exit(1);

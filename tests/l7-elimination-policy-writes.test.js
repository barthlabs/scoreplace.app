'use strict';

const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const policy = require('../functions-autodraw/elimination-policy-config-core.js');
const source = fs.readFileSync('functions-autodraw/index.js', 'utf8');
const cloneStart = source.indexOf('function _clonaConfigDeclarativa(');
const cloneEnd = source.indexOf('function _fasesDeConfiguracaoAtualizaveis(', cloneStart);
assert(cloneStart >= 0 && cloneEnd > cloneStart);
const context = vm.createContext({ HttpsError: class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } } });
vm.runInContext(source.slice(cloneStart, cloneEnd), context);
const clone = value => {
  context.inputJson = JSON.stringify(value);
  return vm.runInContext('_clonaConfigDeclarativa(JSON.parse(inputJson), 0, ["fmt2"])', context);
};
const checked = value => {
  const copy = clone(value);
  policy.validateAndCanonicalizeExplicitPolicy(copy, context.HttpsError);
  return copy;
};

const input = { eliminatoria: { dupla: false, politicaDaChave: 'playin' } };
const result = checked(input);
assert.strictEqual(result.eliminatoria.politicaDaChave, 'repescagem');
assert.strictEqual(input.eliminatoria.politicaDaChave, 'playin', 'request não é mutado');
for (const requested of ['bye', 'sobra_unica']) {
  assert.throws(() => checked({ eliminatoria: { dupla: true, politicaDaChave: requested } }),
    /dupla|incompatível/i, requested + ' explícito não cabe em dupla eliminação');
}
assert.throws(() => checked({ politicaDaChave: 'bye', eliminatoria: { dupla: false, politicaDaChave: 'sobra_unica' } }),
  /não coincidem/i, 'topo e fmt2 direto discordantes são recusados');
assert.strictEqual(checked({ eliminatoria: { dupla: true } }).eliminatoria.dupla, true,
  'documento sem política explícita continua legível');
assert.strictEqual(checked({ fmt2: { eliminatoria: { dupla: false, politicaDaChave: 'bye' } } }).fmt2.eliminatoria.politicaDaChave, 'bye',
  'envelope de ficha mantém suporte');
assert.throws(() => checked({
  politicaDaChave: 'bye',
  fmt2: { eliminatoria: { dupla: false, politicaDaChave: 'bye' } },
  eliminatoria: { dupla: false, politicaDaChave: 'sobra_unica' }
}), /não coincidem/i, 'o terceiro envelope não pode esconder uma política discordante');
assert.throws(() => checked({
  politicaDaChave: 'bye',
  fmt2: { eliminatoria: { dupla: false, politicaDaChave: 'bye' } },
  eliminatoria: { dupla: true, politicaDaChave: 'bye' }
}), /dupla|incompatível|não coincidem/i, 'dupla incompatível não pode ficar escondida no envelope direto');
assert.throws(() => checked({
  politicaDaChave: 'bye',
  fmt2: { eliminatoria: { dupla: true, politicaDaChave: 'bye' } },
  eliminatoria: { dupla: false, politicaDaChave: 'bye' }
}), /dupla|incompatível|não coincidem/i, 'dupla incompatível não pode ficar escondida no envelope da ficha');
const equivalentAliases = checked({
  politicaDaChave: 'playin',
  fmt2: { eliminatoria: { dupla: false, politicaDaChave: 'repescagem' } },
  eliminatoria: { dupla: false, politicaDaChave: 'playin' }
});
assert.strictEqual(equivalentAliases.politicaDaChave, 'repescagem');
assert.strictEqual(equivalentAliases.eliminatoria.politicaDaChave, 'repescagem');
assert.throws(() => checked({ politicaDaChave: 'bye', phases: [
  { kind: 'classification' },
  { kind: 'elimination', elimination: { bracketType: 'double' } }
] }), /dupla eliminação/i, 'fase dupla herda política incompatível e é recusada');
assert.throws(() => checked({ politicaDaChave: 'repescagem', phases: [
  { kind: 'elimination', elimination: { bracketType: 'double' }, politicaDaChave: 'sobra_unica' }
] }), /dupla eliminação/i, 'política da própria fase dupla é validada');
assert.strictEqual(checked({ politicaDaChave: 'repescagem', phases: [
  { kind: 'elimination', elimination: { bracketType: 'single' }, politicaDaChave: 'bye' }
] }).phases[0].politicaDaChave, 'bye', 'fase simples pode diferir do topo');

const handler = source.slice(source.indexOf('exports.applyTournamentFormat = onCall'), source.indexOf('exports.advanceTournamentPhase = onCall'));
assert(/_clonaConfigDeclarativa\(fmt2,\s*0,\s*\['fmt2'\]\)/.test(handler),
  'applyTournamentFormat clona o fmt2 cru enviado ao handler');
assert(/validateAndCanonicalizeExplicitPolicy\(/.test(handler),
  'applyTournamentFormat valida política explícita');
assert(handler.indexOf('validateAndCanonicalizeExplicitPolicy(') < handler.indexOf('compileToPhases(fmt2Clone'),
  'política é validada antes de chegar ao compilador');
const updateHandler = source.slice(source.indexOf('exports.updateTournamentConfiguration = onCall'), source.indexOf('// ─── Ciclo presencial', source.indexOf('exports.updateTournamentConfiguration = onCall')));
assert(updateHandler.includes('_policyBeforeShape = _policyConfig.policyShape(t)') &&
  updateHandler.includes('_policyBeforeShape !== _policyConfig.policyShape(t)') &&
  updateHandler.includes('validateAndCanonicalizeExplicitPolicy(effectivePolicy, HttpsError)'),
  'edição parcial valida o documento fresco apenas quando a política ou formato muda');
const legacy = {
  politicaDaChave: 'bye',
  fmt2: { eliminatoria: { dupla: true, politicaDaChave: 'bye' } },
  phases: [{ kind: 'elimination', elimination: { bracketType: 'double' },
    politicaDaChave: 'bye', name: 'Fase antiga', endDate: '2026-10-20' }]
};
assert.throws(() => policy.validateAndCanonicalizeExplicitPolicy(clone(legacy), context.HttpsError),
  /dupla|incompatível/i, 'combinação legada é incompatível, não foi mascarada');
const dateOnly = clone(legacy);
dateOnly.phases[0].endDate = '2026-10-21';
assert.strictEqual(policy.policyShape(dateOnly), policy.policyShape(legacy),
  'prazo de fase não altera a política histórica que já estava gravada');
const withAlias = { politicaDaChave: 'playin', phases: [{ kind: 'elimination',
  politicaDaChave: 'playin', endDate: '2026-10-20' }] };
const aliasDateOnly = clone(withAlias);
aliasDateOnly.phases[0].endDate = '2026-10-21';
policy.canonicalizePolicyAliases(aliasDateOnly, withAlias);
assert.strictEqual(aliasDateOnly.politicaDaChave, 'playin');
assert.strictEqual(aliasDateOnly.phases[0].politicaDaChave, 'playin');
assert.strictEqual(policy.policyShape(aliasDateOnly), policy.policyShape(withAlias),
  'edição de prazo não converte alias legado nem provoca validação estrutural');
const newAliasPatch = {
  politicaDaChave: 'playin',
  fmt2: { eliminatoria: { politicaDaChave: 'playin', dupla: false } },
  phases: [{ kind: 'elimination', politicaDaChave: 'playin' }]
};
policy.canonicalizePolicyAliases(newAliasPatch, {
  politicaDaChave: 'repescagem',
  fmt2: { eliminatoria: { politicaDaChave: 'repescagem', dupla: false } },
  phases: [{ kind: 'elimination', politicaDaChave: 'repescagem' }]
});
assert.strictEqual(newAliasPatch.politicaDaChave, 'repescagem');
assert.strictEqual(newAliasPatch.fmt2.eliminatoria.politicaDaChave, 'repescagem');
assert.strictEqual(newAliasPatch.phases[0].politicaDaChave, 'repescagem');
assert(updateHandler.indexOf('_policyConfig.canonicalizePolicyAliases(patch, t)') <
  updateHandler.indexOf('Object.keys(patch).forEach(key => {\n      if (key ==='),
  'alias novo é canonizado no patch antes da escrita');
const changedPolicy = clone(legacy);
changedPolicy.phases[0].politicaDaChave = 'sobra_unica';
assert.notStrictEqual(policy.policyShape(changedPolicy), policy.policyShape(legacy),
  'mudança da política passa pela validação efetiva');
assert.throws(() => policy.validateAndCanonicalizeExplicitPolicy(changedPolicy, context.HttpsError),
  /dupla|incompatível/i, 'nova política incompatível continua recusada');
console.log('✓ política explícita validada no envelope direto e na porta applyTournamentFormat');

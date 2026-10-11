/* W.O. de grupos não pode voltar a escolher atleta por nome.
 *
 * A cobertura funcional do motor está em liga-wo-invite; esta trava protege a
 * fronteira cliente→Callable onde uma regressão seria particularmente perigosa:
 * dois homônimos poderiam ter o W.O. aplicado ao slot errado antes de o motor
 * ter chance de validar os jogos. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'js/views/liga-substitution.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');

assert(client.includes('function _ligaAbsentIdentity('), 'cliente precisa resolver o slot ausente por identidade');
assert(client.includes('absentUid: _absentUidRemote'), 'Callables de W.O. precisam receber absentUid');
assert(!client.includes("group.players || []).indexOf(name)"), 'cliente não pode escolher o ausente pelo primeiro nome igual');
assert(server.includes('function _ligaGroupNameByIdentity('), 'servidor precisa reobter o rótulo pelo id do slot');
assert(server.includes('function _ligaAbsentNameOrFail('), 'servidor precisa falhar fechado sem identidade estrutural');
assert(server.includes("const absentName = _ligaAbsentNameOrFail(group, absentUid);"), 'aplicar W.O. deve derivar o nome no servidor');
assert(server.includes('requiresAbsentIdentity: true'), 'preencher/substituir não pode escapar da guarda');
assert(server.includes('const resolvedInvitees = invitees.map'), 'convites devem derivar o rótulo do convidado no servidor');
assert(!server.includes("String(data.absentName || '').trim(), String(data.subUid"), 'substituição direta não aceita nome informado pelo cliente');

console.log('✅ liga-wo-identity-gate: OK');

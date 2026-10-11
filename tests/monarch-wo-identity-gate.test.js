/* Rei/Rainha: o navegador pode mostrar nomes, mas a Callable só pode receber
 * identidade de vaga/participante. Esta trava cobre o limite cliente→servidor,
 * onde homônimos não podem ser resolvidos pelo primeiro rótulo coincidente. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const client = fs.readFileSync(path.join(root, 'js/views/liga-substitution.js'), 'utf8');
const server = fs.readFileSync(path.join(root, 'functions-autodraw/index.js'), 'utf8');

assert(client.includes('absentUid: absentUidExplicit || \'\''), 'cliente envia o id do ausente, não o nome');
assert(client.includes('fillUid: isGuest ? \'\' : (fillUidExplicit || \'\')'), 'cliente envia o id da folga real');
assert(client.includes('guestName: isGuest ? fillName : \'\''), 'nome livre só é permitido para Jogador X');
assert(client.includes("playing['id:' + identity]"), 'folgas são excluídas por identidade, não por rótulo');
assert(!client.includes('var s = {}, n2u ='), 'lista de pessoas do grupo não pode reconstruir uid por nome');
assert(server.includes('function _monarchSlotByReference('), 'servidor resolve a vaga pelo slot/identidade estrutural');
assert(server.includes('const absent = _monarchSlotByReference(tournament, g, p, d.absentSlotId, d.absentUid);'), 'Callable não aceita absentName do navegador');
assert(server.includes("const fillUid = isGuest ? '' : String(d.fillUid || '').trim();"), 'Callable recebe substituto real por id');
assert(!server.includes("String(d.absentName || '').trim(), String(d.fillName || '').trim(), !!d.isGuest"), 'rota antiga que confiava em dois nomes foi removida');

console.log('✅ monarch-wo-identity-gate: OK');

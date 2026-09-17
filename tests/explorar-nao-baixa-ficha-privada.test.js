'use strict';
/* ⛔ A ABA PESSOAS NÃO PRECISA DA FICHA PRIVADA DE NINGUÉM.
 *
 * Amigos e convites mostram o mesmo conjunto público de dados que qualquer
 * cartão: nome, foto, cidade, esporte e preferências de amizade. Antes, cada
 * seção chamava `loadUserProfile(uid)`, que trazia também e-mail, telefone,
 * tokens e configurações da outra pessoa. Este portão protege a migração da
 * etapa 7: quando alguém redesenhar esses cards, não pode reabrir `users` por
 * conveniência.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(raiz, 'js/views/explore.js'), 'utf8');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

function bloco(inicio, fim) {
  const a = src.indexOf(inicio);
  const b = src.indexOf(fim, a + inicio.length);
  if (a < 0 || b < 0) throw new Error('não achei o bloco ' + inicio);
  // Comentário não é execução: a prova observa apenas a implementação.
  return src.slice(a, b).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
}

console.log('\n──── explorar não baixa ficha privada ────\n');

const recebidos = bloco('function _renderPendingRequests', '// ---- Sent friend requests');
const enviados = bloco('function _renderSentRequests', '// ---- My friends');
const amigos = bloco('function _renderMyFriends', '// ---- Global action functions');
const ficha = bloco('window._openUserProfile = function', '// ── Profile sheet helpers');

[['convites recebidos', recebidos], ['convites enviados', enviados], ['meus amigos', amigos], ['fichas abertas pelos cards', ficha]].forEach(([nome, corpo]) => {
  must(/carregarPerfilPublico\(uid\)/.test(corpo), '① ' + nome + ' leem `usersPublic`');
  must(!/loadUserProfile\(uid\)/.test(corpo), '① ' + nome + ' não chamam `loadUserProfile`');
});

must(/var byPublicName = \{\}/.test(enviados),
  '② convites legados são agrupados pelo nome público único');
must(!/var byEmail = \{\}/.test(enviados),
  '② nenhum agrupamento de convite precisa de e-mail privado');
must(!/p\.email/.test(amigos),
  '③ o card de amigos não usa e-mail para existir, ordenar ou deduplicar');
must(!/p\.phone/.test(amigos),
  '③ o card de amigos não usa telefone para existir, ordenar ou deduplicar');

const desfeito = src.replace('window.FirestoreDB.carregarPerfilPublico(uid)', 'window.FirestoreDB.loadUserProfile(uid)');
must(desfeito !== src && desfeito.includes('window.FirestoreDB.loadUserProfile(uid)'),
  '④ controle: apontar uma leitura de volta à ficha privada seria detectável');

console.log('\n✅ ' + ok + ' verificações');

'use strict';

/* Projeção privada MÍNIMA para a organização de um torneio.
 *
 * O elenco precisa saber se há telefone de contato e @ do letzplay; não precisa
 * receber e-mail, token de push, endereço ou o documento de perfil inteiro.
 * Este módulo é puro para que a callable e seus testes compartilhem a mesma
 * lista de slots e de campos devolvidos.
 */
const CAMPOS_CONTATO_ELENCO = [
  'phone', 'phoneCountry', 'phoneSource', 'omitPhone',
  'letzplayHandle', 'letzplaySource',
];

function uidsDoElenco(tournament) {
  const out = [];
  const seen = new Set();
  const put = (uid) => {
    const value = String(uid || '').trim();
    if (!value || seen.has(value)) return;
    seen.add(value); out.push(value);
  };
  const parts = Array.isArray(tournament && tournament.participants)
    ? tournament.participants : Object.values((tournament && tournament.participants) || {});
  parts.forEach((part) => {
    if (!part || typeof part !== 'object') return;
    put(part.uid); put(part.p1Uid); put(part.p2Uid);
    (Array.isArray(part.participants) ? part.participants : []).forEach((member) => put(member && member.uid));
  });
  return out;
}

function contatoDoPerfil(profile) {
  const source = profile || {};
  const out = {};
  CAMPOS_CONTATO_ELENCO.forEach((field) => {
    if (source[field] !== undefined && source[field] !== null) out[field] = source[field];
  });
  return out;
}

module.exports = { CAMPOS_CONTATO_ELENCO, uidsDoElenco, contatoDoPerfil };

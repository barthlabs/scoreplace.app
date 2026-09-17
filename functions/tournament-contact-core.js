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
  'letzplayHandle', 'letzplaySource', 'notifyWhatsApp',
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

function uidsDaOrganizacao(tournament) {
  const out = [];
  const put = (uid) => {
    const value = String(uid || '').trim();
    if (value && out.indexOf(value) === -1) out.push(value);
  };
  put(tournament && tournament.creatorUid);
  (Array.isArray(tournament && tournament.coHosts) ? tournament.coHosts : []).forEach((host) => {
    if (host && host.status === 'active') put(host.uid);
  });
  return out;
}

/* Quem pode abrir o contato de alguém no contexto daquele torneio.
 * O organizador vê todo o elenco. Participantes veem outros participantes e a
 * organização; quem só está navegando pode falar com o organizador, mas não
 * recebe contato de jogador algum. */
function podeVerContatoDoTorneio(tournament, callerUid, targetUid, isOrganizer) {
  const caller = String(callerUid || '').trim();
  const target = String(targetUid || '').trim();
  const elenco = uidsDoElenco(tournament);
  const organizacao = uidsDaOrganizacao(tournament);
  if (!caller || !target || (elenco.indexOf(target) === -1 && organizacao.indexOf(target) === -1)) return false;
  if (isOrganizer) return true;
  if (organizacao.indexOf(target) !== -1) return true;
  return elenco.indexOf(caller) !== -1 && elenco.indexOf(target) !== -1;
}

module.exports = { CAMPOS_CONTATO_ELENCO, uidsDoElenco, uidsDaOrganizacao, podeVerContatoDoTorneio, contatoDoPerfil };

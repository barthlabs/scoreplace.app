/* partes-permissao.js — QUEM PODE MEXER EM QUE  (2.0.122)
 *
 * Ordem do dono (26/ago/2026): _"tudo em CF apenas disparado pelo cliente"_.
 *
 * A porta única de escrita fina no torneio (`aplicarNoTorneio`) precisa de UMA tabela que
 * diga, por campo, quem tem direito. Vive num arquivo próprio para ser testável sem subir
 * nada e para que acrescentar um campo seja acrescentar uma LINHA — não editar um `if`
 * dentro da função. [[project_dividir_exige_todo_escritor_ciente]]
 *
 * ⛔ A lista é ALLOWLIST: campo que não está aqui é NEGADO. O contrário — negar só o que
 * lembrei de proibir — é como se abre buraco sem perceber.
 */

/** O Firestore recusa estes ids — e recusar aqui dá mensagem, não exceção lá dentro. */
function idDeDocumentoValido(k) {
  if (typeof k !== 'string' || !k) return false;
  if (k === '.' || k === '..') return false;
  if (k.indexOf('/') !== -1) return false;
  if (/^__.*__$/.test(k)) return false;
  return Buffer.byteLength(k, 'utf8') <= 1500;
}

/** dono, co-organizador ativo ou admin do torneio. Sempre por uid. */
function ehOrganizador(t, uid) {
  if (!t || !uid) return false;
  if (t.creatorUid && t.creatorUid === uid) return true;
  if (Array.isArray(t.adminUids) && t.adminUids.indexOf(uid) !== -1) return true;
  const ch = Array.isArray(t.coHosts) ? t.coHosts : [];
  return ch.some((c) => c && c.uid === uid && (c.status === 'active' || c.status === 'accepted'));
}

/* Cada entrada diz:
 *   forma  — 'mapa' (chaveado por uid) ou 'lista' (registros com chave de conteúdo)
 *   pode(t, quemChama, chave) — true se essa pessoa pode mexer nesse registro
 * ⭐ `chave` é o uid do ALVO nos mapas de presença: é isso que deixa "cada um marca a si
 * mesmo" ser uma regra e não um comentário. */
const CAMPOS = {
  // Presença: cada um responde por si; o organizador responde por qualquer um.
  // [[project_presenca_explicit_only]] [[project_presenca_caduca_em_24h]]
  checkedIn:          { forma: 'mapa', pode: (t, u, k) => u === k || ehOrganizador(t, u) },
  absent:             { forma: 'mapa', pode: (t, u, k) => u === k || ehOrganizador(t, u) },
  checkedInConfirmed: { forma: 'mapa', pode: (t, u) => ehOrganizador(t, u) },
  vips:               { forma: 'mapa', pode: (t, u) => ehOrganizador(t, u) },

  // Rastro de W.O. e apontamento de categoria: decisão de organização.
  // [[project_wo_e_do_grupo_onde_aconteceu]]
  woClaims:              { forma: 'lista', pode: (t, u) => ehOrganizador(t, u) },
  woLog:                 { forma: 'lista', pode: (t, u) => ehOrganizador(t, u) },
  categoryNotifications: { forma: 'lista', pode: (t, u) => ehOrganizador(t, u) }
};

/**
 * Devolve `{ ok: true }` ou `{ ok: false, motivo }`. Nunca lança — quem chama decide se
 * vira erro para o cliente ou linha de log.
 */
function autoriza(t, quemChama, op) {
  if (!quemChama) return { ok: false, motivo: 'sem login' };
  if (!op || typeof op !== 'object') return { ok: false, motivo: 'operação vazia' };
  const c = CAMPOS[op.parte];
  if (!c) return { ok: false, motivo: 'campo "' + op.parte + '" não é operável por esta porta' };
  const chave = String(op.chave || '');
  if (!chave) return { ok: false, motivo: 'operação sem chave — registro precisa de identidade' };
  /* ⛔ NÃO se valida FORMATO de uid aqui. A primeira versão exigia `[A-Za-z0-9_-]{6,}` e o
   * meu próprio teste a reprovou: quem NÃO tem conta é chaveado pelo NOME que o organizador
   * digitou (com espaço e acento) — é o cânone do projeto, não exceção.
   * O que se valida é o que o Firestore aceita como ID DE DOCUMENTO: sem barra, sem `.`/`..`
   * sozinhos, sem `__reservado__`, e dentro do limite de bytes.
   * A permissão de verdade é `pode()` logo abaixo — chave malformada não é a defesa. */
  if (!idDeDocumentoValido(chave)) return { ok: false, motivo: 'chave inválida como id de documento' };
  if (!c.pode(t, quemChama, chave)) return { ok: false, motivo: 'sem permissão em "' + op.parte + '"' };
  return { ok: true };
}

module.exports = { CAMPOS, ehOrganizador, autoriza, idDeDocumentoValido };

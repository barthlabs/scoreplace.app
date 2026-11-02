/* Projeção canônica de `matches` → `results`.
 *
 * A fonte é sempre o jogo montado; `results` é leitura/autorizações por partida.
 * Este núcleo é puro para que o gatilho de subcoleção não esconda uma regra de
 * estado dentro do Firebase. `replay` é o único campo carregado do espelho antigo,
 * pois não é derivável do jogo.
 */
const R = require('./match-roster');

function jogoPorId(t, matchId) {
  const wanted = String(matchId);
  return R.collectMatches(t).find((m) => m && m.id != null && String(m.id) === wanted) || null;
}

function planoDoEspelho(t, matchId, anterior, tid, nowIso, options = {}) {
  const jogo = jogoPorId(t, matchId);
  // Ausência no retrato administrativo não é prova de exclusão do jogo físico.
  // Só o evento da coleção matches pode autorizar remover seu espelho.
  if (!jogo) return { acao: options.allowDelete === true ? 'delete' : 'skip', matchId: String(matchId) };
  const desejado = R.buildMirrorDoc(t, jogo, tid, nowIso, anterior || null);
  // Sem prova completa dos lados ocupados, o índice de autorização não pode
  // conservar o UID derivado antes da mudança no elenco.
  if (Array.isArray(options.playerUids)) desejado.playerUids = options.playerUids;
  else if (options.clearPlayerUids === true) desejado.playerUids = [];
  if (anterior && R.subdocSignature(anterior) === R.subdocSignature(desejado)) {
    return { acao: 'skip', matchId: String(matchId) };
  }
  return { acao: 'set', matchId: String(matchId), doc: desejado };
}

module.exports = { jogoPorId, planoDoEspelho };

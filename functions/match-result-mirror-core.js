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

function planoDoEspelho(t, matchId, anterior, tid, nowIso) {
  const jogo = jogoPorId(t, matchId);
  if (!jogo) return { acao: 'delete', matchId: String(matchId) };
  const desejado = R.buildMirrorDoc(t, jogo, tid, nowIso, anterior || null);
  if (anterior && R.subdocSignature(anterior) === R.subdocSignature(desejado)) {
    return { acao: 'skip', matchId: String(matchId) };
  }
  return { acao: 'set', matchId: String(matchId), doc: desejado };
}

module.exports = { jogoPorId, planoDoEspelho };

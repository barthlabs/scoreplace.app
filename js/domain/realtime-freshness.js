/* GERADO de src/domain/realtime-freshness.ts por scripts/build-domain.js. Não editar. */
"use strict";
/*
 * Contrato de frescor dos dados Firestore.
 *
 * A memória local pode acelerar a conexão, mas nunca é uma confirmação do
 * estado operacional. Toda tela que aplica um snapshot deve passar por esta
 * porta: `fromCache` só pode abastecer o SDK; quem pinta listas, W.O., jogos,
 * presença, placar e perfil espera a confirmação do servidor.
 */
var ScoreplaceRealtimeFreshness;
(function (ScoreplaceRealtimeFreshness) {
    /** Verdadeiro apenas quando o SDK confirmou que a entrega não veio do cache. */
    function isRemoteSnapshot(snapshot) {
        return !(snapshot && snapshot.metadata && snapshot.metadata.fromCache === true);
    }
    ScoreplaceRealtimeFreshness.isRemoteSnapshot = isRemoteSnapshot;
    /** Opções obrigatórias para que o Firestore entregue o eco remoto sem delta de docs. */
    function listenerOptions() {
        return { includeMetadataChanges: true };
    }
    ScoreplaceRealtimeFreshness.listenerOptions = listenerOptions;
    /** Opções para leituras de recuperação: falhar é preferível a pintar dado antigo. */
    function serverReadOptions() {
        return { source: 'server' };
    }
    ScoreplaceRealtimeFreshness.serverReadOptions = serverReadOptions;
})(ScoreplaceRealtimeFreshness || (ScoreplaceRealtimeFreshness = {}));
const host = globalThis;
host._isRemoteFirestoreSnapshot = ScoreplaceRealtimeFreshness.isRemoteSnapshot;
if (typeof module !== 'undefined' && module)
    module.exports = ScoreplaceRealtimeFreshness;

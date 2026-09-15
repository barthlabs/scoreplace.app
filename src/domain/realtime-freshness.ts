/*
 * Contrato de frescor dos dados Firestore.
 *
 * A memória local pode acelerar a conexão, mas nunca é uma confirmação do
 * estado operacional. Toda tela que aplica um snapshot deve passar por esta
 * porta: `fromCache` só pode abastecer o SDK; quem pinta listas, W.O., jogos,
 * presença, placar e perfil espera a confirmação do servidor.
 */
namespace ScoreplaceRealtimeFreshness {
  export interface SnapshotMetadata {
    fromCache?: unknown;
  }

  export interface SnapshotLike {
    metadata?: SnapshotMetadata | null;
  }

  /** Verdadeiro apenas quando o SDK confirmou que a entrega não veio do cache. */
  export function isRemoteSnapshot(snapshot: SnapshotLike | null | undefined): boolean {
    return !(snapshot && snapshot.metadata && snapshot.metadata.fromCache === true);
  }

  /** Opções obrigatórias para que o Firestore entregue o eco remoto sem delta de docs. */
  export function listenerOptions(): { includeMetadataChanges: true } {
    return { includeMetadataChanges: true };
  }

  /** Opções para leituras de recuperação: falhar é preferível a pintar dado antigo. */
  export function serverReadOptions(): { source: 'server' } {
    return { source: 'server' };
  }
}

const host = globalThis as unknown as { _isRemoteFirestoreSnapshot?: (snapshot: ScoreplaceRealtimeFreshness.SnapshotLike | null | undefined) => boolean };
host._isRemoteFirestoreSnapshot = ScoreplaceRealtimeFreshness.isRemoteSnapshot;

declare const module: { exports?: unknown } | undefined;
if (typeof module !== 'undefined' && module) module.exports = ScoreplaceRealtimeFreshness;

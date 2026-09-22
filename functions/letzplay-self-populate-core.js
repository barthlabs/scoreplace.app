'use strict';

/*
 * Autopreenchimento do perfil a partir do scan do letzplay.
 *
 * O scan é gravado por um organizador em `letzplayScans/{uid}`. Até aqui quem
 * aplicava era o NAVEGADOR do próprio atleta (`store._selfPopulateFromLetzplayScan`),
 * gravando direto em `users/{uid}`. As Rules negavam essa escrita — `gender`,
 * `skillBySport` e `letzplayHandle` estão em `serverOwnedProfileFields()` — e a
 * negativa era engolida por um `catch` que só logava um warn. Resultado: a
 * categoria CHECADA nunca chegava ao perfil e a falha não aparecia em lugar nenhum.
 *
 * Este núcleo é puro: recebe o documento de scan, o perfil atual e o import atual,
 * devolve o que deve ser gravado. Quem grava é a Function, com o UID do token — o
 * navegador não envia valor algum, só pede a aplicação do próprio scan.
 *
 * ⛔ O IMPORT MORA EM DOIS LUGARES, e este núcleo NÃO escolhe entre eles.
 *   • `users/{uid}/letzplay/import` — subdocumento, onde `store.js` grava hoje;
 *   • `users/{uid}.letzplayImport`  — campo do perfil, onde `applyLetzplayScans`
 *     ainda grava e de onde os imports antigos nunca saíram.
 * A ordem canônica (subdoc VENCE, campo do perfil é só queda) é a de
 * `FirestoreDB.carregarLetzplayImport`. Se este núcleo lesse `profile.letzplayImport`
 * sozinho, quem já migrou para o subdoc apareceria como SEM import — e um org-scan
 * com menos jogos sobrescreveria um histórico maior. Por isso o import atual chega
 * por `currentImport`, resolvido por QUEM CHAMA, e esquecê-lo é erro, não zero.
 */

const SPORT = 'Beach Tennis'; // o letzplay cobre somente beach tennis

function plain(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

/* Mesmo critério de `window._lzGamesTotal`: o total declarado vence a lista
 * quando é maior, porque import antigo truncava `games` sem zerar `gamesTotal`. */
function gamesTotal(imp) {
  if (!imp) return 0;
  const listed = Array.isArray(imp.games) ? imp.games.length : 0;
  if (imp.gamesTotal !== null && imp.gamesTotal !== undefined) return Math.max(imp.gamesTotal, listed);
  return listed;
}

/*
 * Devolve `{ profile, import }`:
 *   profile → patch para `users/{uid}` (vazio quando não há nada a fazer)
 *   import  → documento para `users/{uid}/letzplay/import`, ou null
 * Nunca lança por scan ausente ou malformado: um scan inútil é caso normal,
 * não erro de chamada.
 */
function build(input) {
  if (!plain(input)) throw new Error('entrada inválida');
  const doc = plain(input.scanDoc) ? input.scanDoc : {};
  const profile = plain(input.profile) ? input.profile : {};
  const scan = plain(doc.scan) ? doc.scan : {};

  /* `currentImport` é OBRIGATÓRIO e `null` é resposta válida ("procurei, não há").
   * Ausente é erro de chamada, não import vazio: engolir isso devolveria
   * silenciosamente o pior resultado possível — regredir o histórico de quem já
   * migrou para o subdocumento. */
  if (input.currentImport === undefined) {
    throw new Error('currentImport é obrigatório — resolva subdoc primeiro, campo do perfil depois; use null para "não há"');
  }
  const currentImport = plain(input.currentImport) ? input.currentImport : null;

  const patch = {};

  // Gênero só COMPLETA o que falta: o que a pessoa declarou nunca é sobrescrito.
  if (!profile.gender && typeof scan.gender === 'string' && scan.gender.trim()) {
    patch.gender = scan.gender.trim();
  }

  // Categoria CHECADA vence a DECLARADA — a declarada só vale para quem nunca
  // puxou histórico. `profileSkill` é a borda mais fraca da banda ativa, critério
  // conservador. A fonte marcada como 'letzplay' é o que permite ao produto
  // distinguir apuração de autodeclaração; por isso ela é campo de servidor.
  const checked = scan.profileSkill || scan.skill;
  if (checked) {
    const bySport = plain(profile.skillBySport) ? Object.assign({}, profile.skillBySport) : {};
    const source = plain(profile.skillBySportSource) ? Object.assign({}, profile.skillBySportSource) : {};
    if (bySport[SPORT] !== checked || source[SPORT] !== 'letzplay') {
      bySport[SPORT] = checked;
      source[SPORT] = 'letzplay';
      patch.skillBySport = bySport;
      patch.skillBySportSource = source;
    }
  }

  // Import COMPLETO trazido pelo organizador vira o import do PRÓPRIO dono, com
  // procedência. Precedência: vence o MAIS RECENTE — um org-scan antigo nunca
  // sobrescreve um self-import mais novo, medido em jogos.
  let importDoc = null;
  const full = doc.fullImport;
  if (plain(full) && Array.isArray(full.footprint)) {
    const current = currentImport;
    if (!current || gamesTotal(full) > gamesTotal(current)) {
      importDoc = Object.assign({}, full, {
        importedVia: 'organizer',
        importedByName: doc.scannedByName || null,
        importedTournamentName: doc.tournamentName || null,
        importedAt: doc.scannedAt || full.importedAt || null
      });
      if (!profile.letzplayHandle && full.handle) patch.letzplayHandle = full.handle;
    }
  }

  return { profile: patch, import: importDoc };
}

module.exports = { SPORT, gamesTotal, build };

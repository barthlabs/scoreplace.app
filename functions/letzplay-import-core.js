/* ONDE MORA O IMPORT DO LETZPLAY — um lugar só, e NÃO é o documento de perfil.
 *
 * ⛔ O PROBLEMA, MEDIDO em 13/set/2026 na produção: `letzplayImport` é a partida a partida
 * trazida da outra plataforma e mora DENTRO de `users/{uid}`. São **18 dos 279 perfis**,
 * **2.292 jogos somados**, e o MAIOR ocupa **499 KB num único documento de perfil**.
 * Como o Firestore entrega o documento INTEIRO ou nada, qualquer leitura da ficha dessas 18
 * pessoas paga meio megabyte — inclusive o próprio dono, a cada login.
 *
 * ⛔ E PÔR NO ESPELHO PÚBLICO SERIA PIOR, não melhor: o espelho é lido em LOTE pela chave e
 * pela busca (dezenas de documentos por tela). Meio megabyte lá dentro multiplicaria o
 * problema em vez de resolvê-lo.
 *
 * ⭐ A SAÍDA É A MESMA DAS PARTES DO TORNEIO: o volume sai para um documento PRÓPRIO, que só
 * é buscado por quem pede. `users/{uid}/letzplay/import`.
 */
'use strict';

const SUBCOLECAO = 'letzplay';
const DOC = 'import';

/** O caminho do import de alguém. Um lugar só — servidor e cliente leem daqui. */
function caminhoDoImport(uid) {
  return { sub: SUBCOLECAO, doc: DOC, path: 'users/' + String(uid) + '/' + SUBCOLECAO + '/' + DOC };
}

/* ⚠️ A LEITURA ACEITA AS DUAS FORMAS ENQUANTO A MIGRAÇÃO NÃO PASSA, e isso NÃO é o "fallback
 * que recria a divergência": não há duas fontes disputando — há uma fonte se mudando de
 * lugar. O documento novo VENCE sempre; o campo antigo só responde por quem ainda não
 * migrou. No dia em que o campo sumir dos 18 perfis, esta função continua certa sem mudar. */
function escolherImport(doSubdoc, doPerfil) {
  if (doSubdoc && typeof doSubdoc === 'object' && Array.isArray(doSubdoc.games)) return doSubdoc;
  if (doPerfil && typeof doPerfil === 'object') return doPerfil;
  return null;
}

/** Vale a pena mover? (evita gravar subdoc vazio e evita reescrever o que já está lá) */
function precisaMover(perfil) {
  const imp = perfil && perfil.letzplayImport;
  return !!(imp && typeof imp === 'object' && Array.isArray(imp.games) && imp.games.length);
}

module.exports = { SUBCOLECAO, DOC, caminhoDoImport, escolherImport, precisaMover };

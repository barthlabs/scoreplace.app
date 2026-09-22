'use strict';
/* magic-link-patterns.js — A LISTA ÚNICA do que é login por link.
 *
 * POR QUE EXISTE: a proibição precisava valer em DOIS lugares com naturezas diferentes —
 * a FONTE (`tests/no-magic-link-login.test.js`, que varre `js/`, `functions/` e
 * `functions-autodraw/`) e o PACOTE EMBARCADO que vai para a loja (a trava
 * `scripts/check-embedded-www.sh`, chamada pelos dois scripts de release depois do
 * `cap sync`). Duas listas divergem — foi assim que a regra do `cap sync` já ficou copiada
 * e errada nos dois scripts de release antes da trava única existir.
 *
 * ⛔ Fonte limpa NÃO basta: os pacotes nativos são artefatos não rastreados, e um pacote
 * velho pode voltar com o fluxo inteiro e ir para a loja. Medido em 22/set/2026: a fonte
 * tinha 0 ocorrências e os pacotes de iOS e Android tinham 4 CADA.
 */

/* Os sete primeiros são os que a fonte já proibia. `sendSignInLinkToEmail` entrou em
 * 22/set/2026 como endurecimento explícito — não estava na lista antes. */
const PADROES = [
  { re: /sendMagicLink\b/,                          nome: 'sendMagicLink' },
  { re: /signInWithEmailLink\b/,                    nome: 'signInWithEmailLink' },
  { re: /isSignInWithEmailLink\b/,                  nome: 'isSignInWithEmailLink' },
  { re: /generateSignInWithEmailLink\b/,            nome: 'generateSignInWithEmailLink' },
  { re: /collection\(\s*['"]magicLinks['"]\s*\)/,   nome: "collection('magicLinks')" },
  { re: /[?&]ml=/,                                  nome: '?ml= / &ml=' },
  { re: /['"]email_link['"]/,                       nome: "'email_link'" },
  { re: /sendSignInLinkToEmail\b/,                  nome: 'sendSignInLinkToEmail' },
];

/** Devolve o primeiro padrão que aparece no texto, ou null. */
function achar(texto) {
  for (const p of PADROES) if (p.re.test(String(texto || ''))) return p.nome;
  return null;
}

module.exports = { PADROES, achar };

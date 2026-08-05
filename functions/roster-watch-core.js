'use strict';
/* roster-watch-core — vigia estrutural: quem trocou os jogadores de um jogo que JÁ EXISTE?
 *
 * POR QUE existe: os guards de 1.7.26–35 moram no CLIENTE QUE GRAVA e só protegem quem
 * os carrega. O app NATIVO não tem auto-update — mesmo com a 1.7.35 aprovada, existe uma
 * janela com gente rodando 1.6.3/1.7.9 gravando no MESMO torneio. Aqui o servidor enxerga
 * todo mundo, inclusive o cliente velho que nunca vai rodar código novo.
 *
 * COMO SEPARA autoridade de acidente, sem saber quem escreveu (gatilho do Firestore não
 * carrega a identidade do autor): `rosterRev` é um contador de nível de DOCUMENTO que o
 * cliente sobe quando uma troca de escalação é ACEITA. Ele NÃO está na allowlist do
 * participante em `firestore.rules` — que é `hasOnly([...])`, lista FECHADA —, então
 * campo novo já nasce inescrevível por ele. Logo:
 *   escalação mudou + contador subiu  → veio de quem tem autoridade (W.O., sorteio)
 *   escalação mudou + contador PARADO → cliente velho devolvendo estado antigo
 *
 * ⚠️ MODO OBSERVAÇÃO. Este módulo só DESCREVE o que viu; não reverte nada. A decisão de
 * reverter depende de medir antes quantos casos reais aparecem e de que clientes — é a
 * doutrina do projeto (medir antes de mexer), e reverter escalação errado no meio de um
 * torneio ao vivo é pior do que o defeito que se quer evitar.
 */

const CAMPOS = ['p1', 'p2', 'team1', 'team2', 'team1Uids', 'team2Uids', 'p1Uid', 'p2Uid'];

/** Varre as três formas onde jogo mora, devolvendo mapa id→jogo. */
function indexarJogos(t) {
  const idx = {};
  const add = (m) => { if (m && m.id != null) idx[String(m.id)] = m; };
  (Array.isArray(t && t.matches) ? t.matches : []).forEach(add);
  (Array.isArray(t && t.rounds) ? t.rounds : []).forEach((r) => {
    (r && Array.isArray(r.matches) ? r.matches : []).forEach(add);
  });
  (Array.isArray(t && t.groups) ? t.groups : []).forEach((g) => {
    (g && Array.isArray(g.matches) ? g.matches : []).forEach(add);
  });
  return idx;
}

function assinatura(m) {
  return JSON.stringify(CAMPOS.map((k) => (m ? m[k] : null)));
}

/**
 * @param {object} antes  doc ANTES da escrita
 * @param {object} depois doc DEPOIS da escrita
 * @returns {{suspeitos:Array, revAntes:number|null, revDepois:number|null,
 *            contadorSubiu:boolean, jogosNovos:number, motivo:string}}
 */
function detectarTrocaDeEscalacao(antes, depois) {
  const iA = indexarJogos(antes);
  const iD = indexarJogos(depois);
  const revAntes = (antes && typeof antes.rosterRev === 'number') ? antes.rosterRev : null;
  const revDepois = (depois && typeof depois.rosterRev === 'number') ? depois.rosterRev : null;
  const contadorSubiu = (revDepois != null) && (revAntes == null ? revDepois > 0 : revDepois > revAntes);

  const mudaram = [];
  let jogosNovos = 0;
  Object.keys(iD).forEach((id) => {
    if (!iA[id]) { jogosNovos++; return; }              // jogo NOVO: acrescentar é legítimo
    if (assinatura(iD[id]) === assinatura(iA[id])) return;
    mudaram.push({ id, antes: iA[id].p1 + ' x ' + iA[id].p2, depois: iD[id].p1 + ' x ' + iD[id].p2 });
  });

  // Sem troca em jogo existente não há o que observar — mesmo que o contador tenha subido.
  if (!mudaram.length) {
    return { suspeitos: [], revAntes, revDepois, contadorSubiu, jogosNovos, motivo: 'sem troca' };
  }
  if (contadorSubiu) {
    return { suspeitos: [], revAntes, revDepois, contadorSubiu, jogosNovos, motivo: 'troca declarada' };
  }
  return {
    suspeitos: mudaram, revAntes, revDepois, contadorSubiu, jogosNovos,
    motivo: 'troca SEM contador — provável cliente sem os guards',
  };
}

module.exports = { detectarTrocaDeEscalacao, indexarJogos };

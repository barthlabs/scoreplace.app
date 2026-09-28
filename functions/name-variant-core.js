'use strict';
/*
 * name-variant-core.js — sugestões de variante de nome ("Nome 2"), nunca auto-renomeio.
 *
 * POR QUE É UM MÓDULO SEPARADO de name-unique-core.js: as duas políticas são opostas e
 * legítimas, e misturá-las já custou caro uma vez.
 *
 *   • CADASTRO por celular+senha (name-unique-core → registerPhonePassword): REJEITA com
 *     already-exists e aponta a conta existente mascarada. Homônimo ali é quase sempre a
 *     MESMA pessoa (incidente Gabriela Ferreira) — sufixar recriaria a duplicata com nome
 *     maquiado. Há teste travando que aquele módulo NÃO exporte resolvedor de variante.
 *
 *   • LOGIN federado: deixa entrar, mas o trigger sinaliza a colisão e a tela pede que a
 *     pessoa confirme a conta existente ou ESCOLHA um nome livre. Este módulo só forma
 *     sugestões para essa escolha; ele não recebe banco nem devolve um nome para gravar.
 *
 * A detecção e a reserva são canônicas no servidor (name-unique-core/index.js). Manter esta
 * superfície sem `resolveUniqueName` impede que um futuro chamador volte a transformar a
 * pergunta obrigatória em "Nome 2" pelas costas. [[project_homonimo_exige_escolha]]
 */

/** "Nome" (k=1), "Nome 2", "Nome 3"… — mesma forma que o cliente produz. */
function buildVariant(baseName, k) {
  const nm = String(baseName == null ? '' : baseName).trim();
  return (k <= 1) ? nm : (nm + ' ' + k);
}

function ageMs(v) {
  if (v == null) return null;
  const t = v.toMillis ? v.toMillis() : (typeof v === 'string' ? Date.parse(v) : Number(v));
  return isNaN(t) ? null : t;
}

/**
 * Numa colisão, QUEM RECEBE A PERGUNTA? O RECÉM-CHEGADO — nunca quem já estava com o nome.
 *
 * Na prática o trigger só acorda pra quem ESCREVEU o nome, então o estabelecido nem é
 * chamado. Este desempate existe pro caso SIMULTÂNEO: dois logins gravando o mesmo nome
 * quase junto acordam os dois triggers, cada um enxerga o outro e, sem regra determinística,
 * AMBOS poderiam receber o mesmo sinal e a pergunta ficaria inconsistente. Critério: recebe
 * o sinal o mais NOVO; sem idade confiável nos dois lados, desempata pelo uid
 * maior — arbitrário, mas estável e idêntico nas duas execuções.
 */
function shouldIReceiveConflict(meuData, conflito, meuUid) {
  const meu = ageMs(meuData && meuData.createdAt);
  const dele = ageMs(conflito && conflito.createdAt);
  if (meu != null && dele != null && meu !== dele) return meu > dele;
  return String(meuUid || '') > String((conflito && conflito.uid) || '');
}

module.exports = { buildVariant, shouldIReceiveConflict };

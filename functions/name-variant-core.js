'use strict';
/*
 * name-variant-core.js — VARIANTE automática de nome ("Nome 2"), política do LOGIN.
 *
 * POR QUE É UM MÓDULO SEPARADO de name-unique-core.js: as duas políticas são opostas e
 * legítimas, e misturá-las já custou caro uma vez.
 *
 *   • CADASTRO por celular+senha (name-unique-core → registerPhonePassword): REJEITA com
 *     already-exists e aponta a conta existente mascarada. Homônimo ali é quase sempre a
 *     MESMA pessoa (incidente Gabriela Ferreira) — sufixar recriaria a duplicata com nome
 *     maquiado. Há teste travando que aquele módulo NÃO exporte resolvedor de variante.
 *
 *   • LOGIN federado (este módulo): adota variante e deixa entrar. A política do dono é
 *     "nunca bloquear a ENTRADA" (v1.1.3: "as pessoas já têm dificuldade de entrar… melhor
 *     deixar entrar e depois editamos o nome"). Quem bloqueia de verdade é o gate do
 *     PERFIL, que é ação explícita da pessoa.
 *
 * A DETECÇÃO é uma só: importada de name-unique-core (findDisplayNameConflict). O que muda
 * entre os dois caminhos é o que se FAZ com o conflito, não como ele é encontrado.
 *
 * Espelha resolveUniqueDisplayName do cliente (js/firebase-db.js) — mas aqui é o servidor,
 * que é onde o cânone precisa rodar: o do cliente é fail-open e pode simplesmente não
 * rodar, e foi por isso que homônimos continuaram nascendo depois da regra existir.
 */
const { isUnfriendlyName, findDisplayNameConflict } = require('./name-unique-core');

/** "Nome" (k=1), "Nome 2", "Nome 3"… — mesma forma que o cliente produz. */
function buildVariant(baseName, k) {
  const nm = String(baseName == null ? '' : baseName).trim();
  return (k <= 1) ? nm : (nm + ' ' + k);
}

/**
 * Primeiro nome livre a partir do base: "Nome", "Nome 2"… "Nome 9" e, se as 9 estiverem
 * ocupadas, sufixo curto do uid — que é sempre único e encerra a busca.
 * Nome não-amigável (placeholder) passa intacto: não disputa unicidade.
 * Fail-open herdado do findDisplayNameConflict: erro de consulta devolve o nome-base.
 */
async function resolveUniqueName(db, baseName, myUid) {
  const nm = String(baseName == null ? '' : baseName).trim();
  if (!nm || isUnfriendlyName(nm)) return nm;
  for (let k = 1; k <= 9; k++) {
    const cand = buildVariant(nm, k);
    const conflito = await findDisplayNameConflict(db, cand, myUid);
    if (!conflito) return cand;
  }
  return nm + ' ' + String(myUid || '').slice(-4);
}

function ageMs(v) {
  if (v == null) return null;
  const t = v.toMillis ? v.toMillis() : (typeof v === 'string' ? Date.parse(v) : Number(v));
  return isNaN(t) ? null : t;
}

/**
 * Numa colisão, QUEM renomeia? O RECÉM-CHEGADO — nunca quem já estava com o nome.
 *
 * Na prática o trigger só acorda pra quem ESCREVEU o nome, então o estabelecido nem é
 * chamado. Este desempate existe pro caso SIMULTÂNEO: dois logins gravando o mesmo nome
 * quase junto acordam os dois triggers, cada um enxerga o outro e, sem regra determinística,
 * AMBOS renomeariam — deixando o nome original órfão e as duas pessoas com sufixo.
 * Critério: renomeia o mais NOVO; sem idade confiável nos dois lados, desempata pelo uid
 * maior — arbitrário, mas estável e idêntico nas duas execuções.
 */
function shouldIRename(meuData, conflito, meuUid) {
  const meu = ageMs(meuData && meuData.createdAt);
  const dele = ageMs(conflito && conflito.createdAt);
  if (meu != null && dele != null && meu !== dele) return meu > dele;
  return String(meuUid || '') > String((conflito && conflito.uid) || '');
}

module.exports = { buildVariant, resolveUniqueName, shouldIRename };

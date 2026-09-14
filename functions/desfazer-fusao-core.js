'use strict';
/* ⛔⛔ DESFAZER UMA FUSÃO — o que é possível prometer, e o que não é.
 *
 * Ordem do dono (13/set/2026): _"essa mesclagem deveria ter uma possivel reversão dentro de 30
 * dias caso a pessoa responda sim equivocadamente"_.
 *
 * ⛔ A FUSÃO DE HOJE DESTRÓI O QUE A REVERSÃO PRECISARIA. Medido no código: ela APAGA a conta
 * de autenticação absorvida (`deleteUser`) para liberar o celular e o e-mail, que então vão
 * para a sobrevivente — o Firebase não deixa duas contas com a mesma credencial. Depois disso
 * não existe "desfazer": a conta não existe mais.
 *
 * ⭐ A TROCA QUE TORNA A REVERSÃO POSSÍVEL: em vez de APAGAR, a conta absorvida é DESLIGADA e
 * tem as credenciais RETIRADAS (que é o que precisava ser liberado). Ela continua existindo,
 * desligada, com tudo anotado. Passados os 30 dias, aí sim é apagada de vez.
 *
 * ⚠️ E O QUE A REVERSÃO NÃO PODE PROMETER, e por isso é dito em voz alta: ela desfaz o que a
 * FUSÃO fez. O que a pessoa fez DEPOIS, já na conta unida — um torneio novo, um placar —
 * aconteceu naquela conta e fica nela. Prometer "volta tudo como era" seria mentira.
 * [[feedback_nao_prometer_no_botao_o_que_nao_se_pode_conferir]]
 */

const JANELA_DIAS = 30;

/** O prazo acabou? `agoraMs` e `feitaEmMs` em milissegundos. */
function dentroDoPrazo(feitaEmMs, agoraMs) {
  const t = Number(feitaEmMs);
  if (!t || isNaN(t)) return false;
  return (Number(agoraMs) - t) <= JANELA_DIAS * 24 * 3600 * 1000;
}

/** Quantos dias ainda restam (arredondado para baixo, nunca negativo). */
function diasQueRestam(feitaEmMs, agoraMs) {
  const passados = (Number(agoraMs) - Number(feitaEmMs)) / (24 * 3600 * 1000);
  return Math.max(0, Math.floor(JANELA_DIAS - passados));
}

/**
 * O que tirar da conta absorvida para liberar a credencial, e o que guardar para repor.
 * `authDrop` é o UserRecord do Admin SDK (ou um objeto com o mesmo formato).
 *
 * ⛔ `providerData` entra no registro porque provedor federado (Google/Apple) NÃO volta
 * sozinho: repor exige o `uid` do provedor, que só existe enquanto a conta existe. Ler depois
 * seria tarde.
 */
function planejarDesligamento(authDrop) {
  const a = authDrop || {};
  const guardado = {
    email: a.email || '',
    emailVerified: !!a.emailVerified,
    phoneNumber: a.phoneNumber || '',
    provedores: (a.providerData || [])
      .filter((p) => p && p.providerId && p.uid)
      .map((p) => ({ providerId: p.providerId, uid: p.uid })),
  };
  // O que se manda para o Auth agora: solta a credencial e desliga a conta.
  const desligar = { disabled: true };
  if (guardado.email) desligar.email = null;
  if (guardado.phoneNumber) desligar.phoneNumber = null;
  return { guardado, desligar };
}

/**
 * A partir do registro, o que repor na conta absorvida ao desfazer.
 * ⚠️ Só volta a credencial que a SOBREVIVENTE recebeu na fusão — repor uma credencial que a
 * sobrevivente já tinha antes roubaria dela o login que sempre foi seu.
 */
function planejarVolta(guardado, recebidasPelaSobrevivente) {
  const g = guardado || {};
  const rec = recebidasPelaSobrevivente || {};
  const paraOAbsorvido = { disabled: false };
  const tirarDaSobrevivente = {};
  if (g.email && rec.email && String(rec.email).toLowerCase() === String(g.email).toLowerCase()) {
    paraOAbsorvido.email = g.email;
    paraOAbsorvido.emailVerified = g.emailVerified;
    tirarDaSobrevivente.email = null;
  }
  if (g.phoneNumber && rec.phoneNumber && rec.phoneNumber === g.phoneNumber) {
    paraOAbsorvido.phoneNumber = g.phoneNumber;
    tirarDaSobrevivente.phoneNumber = null;
  }
  return { paraOAbsorvido, tirarDaSobrevivente, provedores: g.provedores || [] };
}

/**
 * Desfaz uma alteração registrada: devolve o que gravar para voltar ao estado anterior.
 * `antes` é o mapa campo → valor de antes. Campo que não existia volta como remoção.
 */
function reverterCampos(antes, marcaDeRemocao) {
  const out = {};
  Object.keys(antes || {}).forEach((k) => {
    const v = antes[k];
    out[k] = (v === undefined || v === null) ? marcaDeRemocao : v;
  });
  return out;
}

/**
 * Corta o registro em pedaços que cabem num documento do Firestore (1 MB).
 * ⛔ Registro que estoura o limite falharia a gravação INTEIRA — e uma fusão que não consegue
 * registrar o que fez é uma fusão sem volta. Cortar é o que mantém a promessa de pé.
 */
function fatiar(entradas, limiteBytes) {
  const teto = limiteBytes || 700000;
  const out = [];
  let atual = [];
  /* ⛔ CONTAR O ENVELOPE, NÃO SÓ O CONTEÚDO. Somando apenas o tamanho de cada anotação, a
   * fatia estourava o limite pelos colchetes e pelas vírgulas — pouco, mas o bastante para a
   * gravação inteira falhar. Começa em 2 (os colchetes) e cada item paga a sua vírgula. */
  let tam = 2;
  (entradas || []).forEach((e) => {
    const n = JSON.stringify(e).length + 1;
    if (atual.length && (tam + n) > teto) { out.push(atual); atual = []; tam = 2; }
    atual.push(e);
    tam += n;
  });
  if (atual.length) out.push(atual);
  return out;
}

module.exports = {
  JANELA_DIAS, dentroDoPrazo, diasQueRestam,
  planejarDesligamento, planejarVolta, reverterCampos, fatiar,
};

'use strict';

/* ⛔⛔ DECISÕES PURAS DO PASSKEY — sem rede, sem Firestore, sem Auth.
 *
 * Por que passkey existe aqui: medido em 25/set/2026, 4 dos 9 pares de conta duplicada são
 * Apple + Google — gente que voltou, não achou a própria conta e criou outra. O caminho de hoje é
 * "três botões de entrada, chuta". Passkey tira passos: a chave é DESCOBRÍVEL, então a pessoa não
 * digita nome nem e-mail, e a pergunta "qual conta eu usei" deixa de existir.
 *
 * ⛔ A CONFERÊNCIA DA ASSINATURA NÃO MORA AQUI, e é de propósito: ela é análise de estrutura binária
 * e de assinatura, e vive na biblioteca. O que mora aqui são as decisões que erram em silêncio se
 * ficarem espalhadas — origem aceita, uso único do desafio, e o contador.
 */

/* ⛔ ORIGENS ACEITAS: lista fechada. Aceitar qualquer origem é aceitar que um site alheio peça a
 * assinatura e entre na conta da pessoa — é o ataque que o campo `origin` existe para barrar. */
const ORIGENS = ['https://scoreplace.app', 'https://www.scoreplace.app'];
/* O domínio da chave. ⚠️ Mudar isto INVALIDA todo passkey já cadastrado: a chave é presa ao
 * domínio, por desenho do padrão. Não é constante decorativa. */
const DOMINIO = 'scoreplace.app';
/* Prazo do desafio. Curto porque desafio é de uso único e só precisa durar o gesto da pessoa. */
const DESAFIO_VALE_MS = 5 * 60 * 1000;

function texto(v) { return v == null ? '' : String(v).trim(); }

/** A origem que chegou é uma das nossas? */
function origemAceita(origem) {
  return ORIGENS.indexOf(texto(origem)) !== -1;
}

/**
 * O desafio guardado ainda vale para este uso?
 * ⛔ TRÊS RECUSAS, e cada uma já foi vulnerabilidade em sistema real:
 *   · desafio inexistente — assinatura sem desafio nosso é assinatura de outro lugar;
 *   · desafio JÁ USADO — sem isto, uma assinatura interceptada vale para sempre;
 *   · desafio VENCIDO — limita a janela de quem capturou o gesto.
 */
function desafioValido(registro, agoraMs) {
  const r = registro;
  if (!r || !texto(r.desafio)) return { ok: false, motivo: 'inexistente' };
  if (r.usadoEm) return { ok: false, motivo: 'ja-usado' };
  const nasceu = Number(r.criadoEmMs || 0);
  if (!nasceu || (agoraMs - nasceu) > DESAFIO_VALE_MS) return { ok: false, motivo: 'vencido' };
  if (agoraMs < nasceu - 60000) return { ok: false, motivo: 'futuro' };   // relógio torto
  return { ok: true, motivo: null };
}

/**
 * O contador da credencial avançou?
 * ⛔ É A DEFESA CONTRA REUSO DE ASSINATURA. O aparelho incrementa um contador a cada uso; assinatura
 * repetida chega com contador igual ou menor. Quem não confere isto aceita a mesma assinatura duas
 * vezes.
 * ⚠️ Contador ZERO nos dois lados é legítimo e comum: vários aparelhos (incluindo Apple) não
 * implementam contador. Recusar isso trancaria a maioria dos iPhones — o teto é: se o guardado é 0
 * e o novo é 0, passa; se o guardado é maior que zero, o novo tem que ser MAIOR.
 */
function contadorAvancou(guardado, novo) {
  const g = Number(guardado || 0), n = Number(novo || 0);
  if (g === 0 && n === 0) return true;
  return n > g;
}

/** O que se guarda de uma credencial nova. ⛔ Chave PÚBLICA; nunca há chave privada do nosso lado. */
function registroDaCredencial(info, agoraIso) {
  const i = info || {};
  return {
    credentialId: texto(i.credentialId),
    publicKey: texto(i.publicKey),          // base64url
    counter: Number(i.counter || 0),
    transports: Array.isArray(i.transports) ? i.transports.map(texto).filter(Boolean) : [],
    deviceType: texto(i.deviceType) || null, // 'singleDevice' | 'multiDevice' (sincroniza?)
    backedUp: i.backedUp === true,
    criadoEm: texto(agoraIso),
    ultimoUsoEm: null,
  };
}

/**
 * Pode CADASTRAR mais um passkey nesta conta?
 * ⛔ Teto por conta: sem limite, uma conta invadida ganharia dezenas de chaves e a pessoa não teria
 * como saber quais são dela. Com teto, acrescentar exige remover — e remover é ato visível.
 */
const MAX_POR_CONTA = 10;
function podeCadastrarMais(quantasJaTem) {
  return Number(quantasJaTem || 0) < MAX_POR_CONTA;
}

/* ⛔⛔ LIMITE DE USO NUMA PORTA PÚBLICA — e o que ele é e NÃO é.
 *
 * ⭐ CORREÇÃO DE UMA AFIRMAÇÃO FALSA MINHA (25/set/2026). Eu havia escrito que `maxInstances: 10`
 * protegia a porta pública. NÃO protege: ele limita CONCORRÊNCIA, não requisições nem gravações —
 * dez instâncias atendem um laço infinito com folga. Anotar proteção que não existe é pior que não
 * ter proteção, porque o próximo a ler acredita.
 *
 * ⛔ O MECANISMO PADRÃO para isto é App Check: o servidor exige prova de que a chamada vem do app
 * de verdade. Ele NÃO existe neste projeto, e ligá-lo toca as 179 portas e tem passo de
 * infraestrutura que é do dono. Fica nomeado como a saída certa, e é leva própria.
 *
 * ⇒ Enquanto isso, o limite é por ORIGEM e por JANELA DE MINUTO, com custo de escrita LIMITADO: um
 * documento por origem por minuto, e não um por tentativa. Um laço de mil chamadas por minuto vira
 * UMA gravação, não mil — é a diferença entre um teto e um convite.
 * ⚠️ Não é defesa contra quem distribui o ataque por muitas origens. É teto para o caso bobo, que é
 * o que acontece de verdade, e é honesto dizer até onde vai. */
const TETO_POR_MINUTO = 30;
function janelaDeMinuto(agoraMs) { return Math.floor(Number(agoraMs || 0) / 60000); }
function estourouOTeto(quantasNaJanela) { return Number(quantasNaJanela || 0) >= TETO_POR_MINUTO; }

module.exports = {
  TETO_POR_MINUTO, janelaDeMinuto, estourouOTeto,
  ORIGENS, DOMINIO, DESAFIO_VALE_MS, MAX_POR_CONTA,
  origemAceita, desafioValido, contadorAvancou, registroDaCredencial, podeCadastrarMais,
};

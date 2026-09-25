'use strict';
/* ⛔⛔ ERRO TEMPORÁRIO DE E-MAIL NÃO É "A PESSOA NÃO RECEBEU" (24/set/2026).
 *
 * MEDIDO na fila de produção: 128 e-mails parados em `delivery.state === 'ERROR'`, atingindo
 * 75 pessoas, TODOS com a mesma causa:
 *     "421-4.3.0 Temporary System Problem. Try again later."
 * O mais recente é de 11/jun/2026 — três meses sem ninguém ver.
 *
 * `421` é classe **4xx** do SMTP: transitório, o provedor pede para tentar de novo. Não é caixa
 * cheia nem endereço inexistente. Mas o relatório de comunicado contava TODO `ERROR` como
 * "não recebeu" — e o comentário dele dizia que pegava justamente caixa cheia e endereço
 * inexistente, quando nenhuma das 128 era isso. 75 pessoas marcadas como não alcançadas por um
 * problema momentâneo de quem entrega, num relatório que o organizador usa para decidir.
 *
 * ⛔ CLASSIFICA SÓ POR CÓDIGO INEQUÍVOCO. Eu ia aceitar frases ("try again later",
 * "mailbox full") como reforço: saem. Texto de provedor muda sem avisar, e adivinhar frase é
 * como se erra de novo no ano que vem. Sem código, é `desconhecida`.
 * ⛔ E `desconhecida` NÃO é bounce. Num relatório que o dono lê para agir, errar para o lado de
 * "não sei" é o único honesto — dizer "não recebeu" sem prova é afirmar o que não se mediu.
 * [[feedback_nao_afirmar_causa_sem_medir]]
 */

/* Código SMTP estendido (`4.3.0`, `5.1.1`) e básico de 3 dígitos (`421`, `550`).
 *
 * ⛔ O BÁSICO SÓ VALE NO COMEÇO DA LINHA OU SEGUIDO DE `-`. Na primeira versão eu aceitava
 * `[45]\d\d` em qualquer lugar do texto, e a frase "entregue em 2026 para 421 pessoas"
 * classificava como TRANSITÓRIA. Número de três dígitos aparece em texto livre; código SMTP
 * aparece onde o protocolo o põe. Foi o meu próprio teste de mesa que pegou. */
const RE_ESTENDIDO = /(?:^|[\s:(\-])([45])\.\d{1,3}\.\d{1,3}(?:[\s)\-:]|$)/;
const RE_BASICO = /(?:^|\n)\s*([45]\d{2})(?=[\s\-:])|(?:^|[\s:])([45]\d{2})-/;

/**
 * Classifica a causa de uma falha de entrega.
 * @returns {'transitoria'|'permanente'|'desconhecida'}
 */
function classificarFalhaDeEmail(texto) {
  const s = String(texto == null ? '' : texto);
  if (!s.trim()) return 'desconhecida';
  let classe = null;
  const ext = s.match(RE_ESTENDIDO);
  if (ext) classe = ext[1];
  if (!classe) {
    const bas = s.match(RE_BASICO);
    const cod = bas && (bas[1] || bas[2]);
    if (cod) classe = cod[0];
  }
  if (classe === '4') return 'transitoria';
  if (classe === '5') return 'permanente';
  return 'desconhecida';
}

/** Só a PERMANENTE conta como "não recebeu". */
function ehBounceDeVerdade(texto) {
  return classificarFalhaDeEmail(texto) === 'permanente';
}

/** O texto da falha, de onde a extensão o deixa. */
function textoDaFalha(docData) {
  const d = (docData && docData.delivery) || {};
  return String(d.error || d.info || '');
}

module.exports = { classificarFalhaDeEmail, ehBounceDeVerdade, textoDaFalha };

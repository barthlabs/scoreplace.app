'use strict';
/* ── ⏱️ O QUE DÁ PRA MUDAR NUM TORNEIO JÁ SORTEADO ──────────────────────────────────
 * Relato do dono (12/set/2026, Confra, Fase 2 em andamento): _"não consigo salvar alterações
 * nas datas"_ — e a tela respondia _"A chave já existe; altere apenas a configuração que não
 * recria as rodadas"_.
 *
 * O QUE ACONTECIA, medido no caminho do save: arrastar a régua da eliminatória muda
 * `fmt2.eliminatoria.roundBounds`. Ao salvar, a tela manda `fmt2` inteiro, e `fmt2` está na
 * lista de campos ESTRUTURAIS — os que recriariam a chave. A trava então recusava o pedido
 * inteiro por causa de um prazo. Resultado prático: num torneio com chave sorteada era
 * IMPOSSÍVEL corrigir a data-limite de uma rodada, que é justamente o ajuste que a fase em
 * andamento mais precisa.
 *
 * ⛔ A TRAVA NÃO AFROUXA. O que muda é a PERGUNTA: em vez de "veio `fmt2` no pedido?" (que
 * responde sim mesmo quando só um horário mudou), pergunta-se "o que mudou DENTRO dele?".
 * Só os caminhos desta lista podem mudar; qualquer outra diferença — formato, número de
 * rodadas, grupos, esporte — continua recusada com a mesma mensagem.
 * ⛔ E O QUE SE GRAVA É A MESCLA, NÃO O QUE VEIO: partimos do `fmt2` canônico e aplicamos
 * só os caminhos permitidos. Assim nenhum campo estrutural entra de carona nem por engano
 * de uma aba velha — a diferença é conferida e o valor gravado é construído aqui.
 *
 * Vive num módulo próprio porque `functions-autodraw/index.js` registra onCall no import e
 * não pode ser exigido por teste. [[project_porta_unica_de_escrita_cf]]
 */

/* Os prazos da eliminatória: a régua (roundBounds) e o fim da fase. Nada além disso. */
const CAMINHOS_ATIVOS_FMT2 = [
  'eliminatoria.roundBounds',
  'eliminatoria.endDate',
  'eliminatoria.endTime'
];

function _clone(v) { return (v === undefined) ? undefined : JSON.parse(JSON.stringify(v)); }

function _leia(obj, caminho) {
  const partes = caminho.split('.');
  let cur = obj;
  for (let i = 0; i < partes.length; i++) {
    if (!cur || typeof cur !== 'object') return undefined;
    cur = cur[partes[i]];
  }
  return cur;
}

function _escreva(obj, caminho, valor) {
  const partes = caminho.split('.');
  let cur = obj;
  for (let i = 0; i < partes.length - 1; i++) {
    const k = partes[i];
    if (!cur[k] || typeof cur[k] !== 'object' || Array.isArray(cur[k])) cur[k] = {};
    cur = cur[k];
  }
  const ultimo = partes[partes.length - 1];
  if (valor === undefined) delete cur[ultimo];
  else cur[ultimo] = valor;
}

/**
 * Diz se o `fmt2` enviado difere do canônico SOMENTE nos caminhos ativos.
 * @returns {{ok:true, valor:Object}} com o valor a gravar (a mescla), ou
 *          {{ok:false, motivo:string}} quando a diferença é estrutural.
 */
function fmt2Atualizavel(atual, enviado, caminhos) {
  const lista = Array.isArray(caminhos) ? caminhos : CAMINHOS_ATIVOS_FMT2;
  if (!enviado || typeof enviado !== 'object' || Array.isArray(enviado)) {
    return { ok: false, motivo: 'configuração de formato inválida' };
  }
  // Sem `fmt2` canônico não há o que mesclar: o pedido seria a estrutura inteira, nova.
  if (!atual || typeof atual !== 'object' || Array.isArray(atual)) {
    return { ok: false, motivo: 'o torneio ainda não tem configuração de formato gravada' };
  }
  const mescla = _clone(atual);
  lista.forEach((c) => { _escreva(mescla, c, _clone(_leia(enviado, c))); });
  if (JSON.stringify(mescla) !== JSON.stringify(enviado)) {
    return { ok: false, motivo: 'a alteração passa por campos que recriariam as rodadas' };
  }
  return { ok: true, valor: mescla };
}

module.exports = { CAMINHOS_ATIVOS_FMT2, fmt2Atualizavel };

'use strict';
/* rebase-core — o servidor não sobrescreve o que aconteceu na quadra enquanto pensava.
 *
 * POR QUE existe: o `autoDraw` lê os torneios numa QUERY única (uma leitura para
 * todos), depois carrega perfis pela rede (`_preloadDrawNames`) e processa os
 * torneios em SEQUÊNCIA — a janela entre ler e gravar é de segundos. Gravar
 * `rounds: t.rounds` cru devolveria a chave como estava na leitura: um placar
 * lançado no meio tempo seria apagado PELO SERVIDOR. É a mesma classe de perda
 * fechada no cliente em 1.7.26–35, e ali o guard do `saveTournament` não alcança —
 * este caminho é Admin SDK e nem passa pelo cliente.
 *
 * A REGRA: a contribuição de um sorteio são as rodadas que ele ACRESCENTOU. Todo o
 * resto vem da leitura FRESCA, feita dentro da transação. Assim o placar de quem
 * jogou vence, e a rodada nova entra.
 *
 * Mora aqui, e não inline no index.js, porque o index registra onSchedule e lê
 * secrets no import — não é `require`-ável em teste. Regra do projeto: o que dói
 * errar mora em módulo puro, com teste exercitando o CÓDIGO REAL.
 */

/**
 * @param {Array}  freshRounds   rodadas lidas AGORA (dentro da transação)
 * @param {Array}  roundsDoMotor `t.rounds` depois do motor rodar (antigas + novas)
 * @param {number} roundsAntes   quantas rodadas existiam ANTES do motor rodar
 * @returns {{rounds: Array, acrescentadas: number, descartadas: number}}
 */
function rebaseRounds(freshRounds, roundsDoMotor, roundsAntes) {
  const _fresh = Array.isArray(freshRounds) ? freshRounds : [];
  const _motor = Array.isArray(roundsDoMotor) ? roundsDoMotor : [];
  const _antes = (typeof roundsAntes === 'number' && roundsAntes >= 0) ? roundsAntes : 0;

  const novas = _motor.slice(_antes);

  // Dedup por NÚMERO da rodada: a transação pode re-executar (conflito de versão) e
  // sem isto a re-execução duplicaria a rodada recém-criada.
  const jaTem = {};
  _fresh.forEach((r, i) => { jaTem[chaveRodada(r, i)] = 1; });

  const acrescentar = novas.filter((r, i) => !jaTem[chaveRodada(r, _antes + i)]);

  return {
    rounds: _fresh.concat(acrescentar),
    acrescentadas: acrescentar.length,
    descartadas: novas.length - acrescentar.length,
  };
}

function chaveRodada(r, i) {
  return String(r && r.round != null ? r.round : i);
}

module.exports = { rebaseRounds };

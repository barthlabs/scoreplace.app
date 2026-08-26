const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo
/* recorte.js — RECORTAR CÓDIGO-FONTE SEM CONTAR CARACTERES
 *
 * ⛔ POR QUE ISTO EXISTE: 47 recortes em 33 suítes usavam janela de tamanho fixo
 * (`_R.ateOFim(src, i)`). Sete vezes um teste reprovou sem que NADA tivesse regredido —
 * bastou um comentário a mais empurrar a linha procurada pra fora do recorte. O custo real
 * não é o minuto perdido: teste que falha sem defeito ENSINA A IGNORAR TESTE, e é aí que
 * passa um defeito de verdade.
 *
 * ⭐ `ateOFim` acompanha o código: acha a primeira chave depois do ponto de partida e casa
 * até a que a fecha, ignorando chave dentro de string, template e comentário. Cresce o
 * comentário, o recorte cresce junto.
 */
'use strict';

/** Índice logo APÓS o `}` que fecha o primeiro bloco iniciado em/depois de `i`. */
function fimDoBloco(src, i) {
  var abre = src.indexOf('{', i);
  if (abre === -1) return -1;
  var n = 0, k = abre;
  while (k < src.length) {
    var c = src[k], d = src[k + 1];
    if (c === '/' && d === '/') { k = src.indexOf('\n', k); if (k === -1) return -1; continue; }
    if (c === '/' && d === '*') { k = src.indexOf('*/', k); if (k === -1) return -1; k += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      var q = c; k++;
      while (k < src.length && src[k] !== q) { if (src[k] === '\\') k++; k++; }
      k++; continue;
    }
    if (c === '{') n++;
    else if (c === '}') { n--; if (n === 0) return k + 1; }
    k++;
  }
  return -1;
}

/**
 * O trecho que começa em `i` e vai até o fim do construto que começa ali.
 * ⚠️ Se não achar bloco (o ponto de partida não abre nada — um comentário solto, por
 * exemplo), devolve até o fim do arquivo: recortar DEMAIS nunca esconde uma linha; recortar
 * de menos esconde, e foi disso que este arquivo nasceu.
 */
function ateOFim(src, i) {
  if (typeof src !== 'string' || !(i >= 0)) return '';
  var f = fimDoBloco(src, i);
  return src.slice(i, f === -1 ? src.length : f);
}

/** Igual, mas parando na próxima âncora de topo (`\nexports.`, `\nfunction `, `\nwindow.`). */
function ateAProxima(src, i, ancora) {
  if (typeof src !== 'string' || !(i >= 0)) return '';
  var f = src.indexOf(ancora, i + 1);
  return src.slice(i, f === -1 ? src.length : f);
}

/**
 * De `i` até SAIR do bloco que o contém. É o primitivo certo quando o ponto de partida está
 * no MEIO de uma função (um marcador, um comentário) e o que se quer é "daqui até o fim
 * desta função" — `ateOFim` erraria, porque casaria o primeiro `{` interno (um `if`, um
 * objeto literal) e pararia cedo demais.
 * ⚠️ Foi exatamente assim que 6 das 33 suítes reprovaram na primeira varredura: recorte
 * MENOR que a janela fixa que substituía. Recortar de menos esconde linha; é o defeito que
 * este arquivo existe pra matar, e ele reapareceu do outro lado.
 */
function ateSairDoBloco(src, i) {
  if (typeof src !== 'string' || !(i >= 0)) return '';
  var n = 0, k = i;
  while (k < src.length) {
    var c = src[k], d = src[k + 1];
    if (c === '/' && d === '/') { k = src.indexOf('\n', k); if (k === -1) break; continue; }
    if (c === '/' && d === '*') { k = src.indexOf('*/', k); if (k === -1) break; k += 2; continue; }
    if (c === '"' || c === "'" || c === '`') {
      var q = c; k++;
      while (k < src.length && src[k] !== q) { if (src[k] === '\\') k++; k++; }
      k++; continue;
    }
    if (c === '{') n++;
    else if (c === '}') { if (n === 0) return src.slice(i, k + 1); n--; }
    k++;
  }
  return src.slice(i);
}

/**
 * O bloco INTEIRO que contém `i` — sobe até a chave que o abre e casa até a que a fecha.
 * É o que se quer quando o ponto de partida é um MARCADOR no meio do código ("a linha tal")
 * e a pergunta é sobre a função onde ele mora.
 * ⚠️ Nasceu porque um teste partia de `indexOf(marcador) - 200`: começar 200 caracteres
 * antes é uma posição ARBITRÁRIA — pode cair no meio de uma string, de um comentário ou de
 * outra função. Contar caracteres pra trás é o mesmo defeito de contar pra frente.
 */
function oBlocoQueContem(src, i) {
  if (typeof src !== 'string' || !(i >= 0)) return '';
  var n = 0, k = i;
  while (k >= 0) {                       // sobe até a chave que ABRE o bloco de `i`
    var c = src[k];
    if (c === '}') n++;
    else if (c === '{') { if (n === 0) break; n--; }
    k--;
  }
  if (k < 0) return src;                 // topo do arquivo: devolve tudo (recortar demais nunca esconde)
  var f = fimDoBloco(src, k);
  return src.slice(k, f === -1 ? src.length : f);
}

module.exports = { ateOFim, ateAProxima, ateSairDoBloco, oBlocoQueContem, fimDoBloco };

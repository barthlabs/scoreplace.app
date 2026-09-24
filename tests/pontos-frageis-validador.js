'use strict';
/* ⛔⛔ O LEITOR — função PURA, usada pela árvore REAL e pelas falsificações.
 *
 * Se o teste usasse um caminho para a árvore e outro para as falsificações, eu estaria
 * provando um código e publicando outro. Tudo passa por aqui.
 *
 * ⛔ JS é lido pelo ACORN (já no repo): dele saem comentários e ranges de string, regex e
 * template, sem eu escrever lexer. Escrever um à mão seria assumir justamente a parte mais
 * fácil de errar — barra de divisão × barra de regex, crase, interpolação.
 * ⛔ RULES NÃO É JS e tem scanner próprio: `firestore.rules` não tem literal de regex, e
 * `match /results/{matchId}` faria um lexer JS abrir uma regex na primeira barra e comer o
 * resto do arquivo — mascarando justo os blocos que as entradas 9 e 10 protegem.
 * ⛔ O mascaramento troca caractere por ESPAÇO, preservando o comprimento: é o offset que
 * permite, achada a âncora, voltar ao comentário imediatamente anterior.
 */
const acorn = require('acorn');

/** Substitui um intervalo por espaços, preservando quebras de linha e o comprimento. */
function _apaga(buf, inicio, fim) {
  for (let i = inicio; i < fim && i < buf.length; i++) {
    if (buf[i] !== '\n') buf[i] = ' ';
  }
}

/** JS pelo acorn: mascara string, regex e o TEXTO da template; `${...}` segue sendo código. */
function lerJs(fonte) {
  const buf = fonte.split('');
  const comentarios = [];
  const opcoes = {
    ecmaVersion: 'latest', sourceType: 'script', allowReturnOutsideFunction: true,
    allowAwaitOutsideFunction: true, allowHashBang: true,
    onComment(bloco, texto, inicio, fim) {
      comentarios.push({ inicio: inicio, fim: fim, texto: texto });
      _apaga(buf, inicio, fim);
    },
    onToken(token) {
      const t = token.type && token.type.label;
      if (t === 'string' || t === 'regexp') { _apaga(buf, token.start, token.end); return; }
      /* Template: o acorn entrega cada pedaço de TEXTO como token próprio, e o que está
       * dentro de `${}` vem como tokens normais de código — então mascarar só o pedaço de
       * texto já deixa a interpolação intacta, que é o comportamento certo. */
      if (t === 'template') _apaga(buf, token.start, token.end);
    }
  };
  try { acorn.parse(fonte, opcoes); }
  catch (e) { throw new Error('não deu para ler o arquivo como JS: ' + (e && e.message)); }
  comentarios.sort((a, b) => a.inicio - b.inicio);
  return { mascarado: buf.join(''), comentarios: comentarios };
}

/** Rules: só aspas e os dois comentários. ⛔ SEM regra de regex — as barras são caminhos. */
function lerRules(fonte) {
  const buf = fonte.split('');
  const comentarios = [];
  let i = 0;
  while (i < fonte.length) {
    const c = fonte[i], d = fonte[i + 1];
    if (c === '/' && d === '/') {
      let j = i; while (j < fonte.length && fonte[j] !== '\n') j++;
      comentarios.push({ inicio: i, fim: j, texto: fonte.slice(i + 2, j) });
      _apaga(buf, i, j); i = j; continue;
    }
    if (c === '/' && d === '*') {
      let j = fonte.indexOf('*/', i + 2); j = (j === -1) ? fonte.length : j + 2;
      comentarios.push({ inicio: i, fim: j, texto: fonte.slice(i + 2, j - 2) });
      _apaga(buf, i, j); i = j; continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < fonte.length && fonte[j] !== c) { if (fonte[j] === '\\') j++; j++; }
      j = Math.min(j + 1, fonte.length);
      _apaga(buf, i, j); i = j; continue;
    }
    i++;
  }
  return { mascarado: buf.join(''), comentarios: comentarios };
}

/* ⛔ LINHAS `//` SEGUIDAS SÃO UM COMENTÁRIO SÓ. O leitor entrega uma por linha, e sem
 * juntá-las o "comentário adjacente" seria sempre a ÚLTIMA linha — então uma anotação de
 * quatro linhas reprovaria só porque a marca estava na primeira. Bloco é o que a pessoa
 * escreveu, não o que o parser recortou. */
function _juntaLinhas(fonte, comentarios) {
  const out = [];
  comentarios.forEach((c) => {
    const anterior = out[out.length - 1];
    const ehLinha = fonte.slice(c.inicio, c.inicio + 2) === '//';
    const anteriorEhLinha = anterior && fonte.slice(anterior.inicio, anterior.inicio + 2) === '//';
    if (anterior && ehLinha && anteriorEhLinha && fonte.slice(anterior.fim, c.inicio).trim() === '') {
      anterior.fim = c.fim;
      anterior.texto += '\n' + c.texto;
      return;
    }
    out.push({ inicio: c.inicio, fim: c.fim, texto: c.texto });
  });
  return out;
}

function ler(fonte, tipoArquivo) {
  const lido = tipoArquivo === 'rules' ? lerRules(fonte) : lerJs(fonte);
  return { mascarado: lido.mascarado, comentarios: _juntaLinhas(fonte, lido.comentarios) };
}

/** Todas as posições da âncora no texto mascarado (portanto, só em CÓDIGO). */
function _posicoes(mascarado, ancora) {
  const out = [];
  let i = mascarado.indexOf(ancora);
  while (i !== -1) { out.push(i); i = mascarado.indexOf(ancora, i + 1); }
  return out;
}

/* Blocos `match` das Rules, por casamento de chaves. ⛔ Estrutural, não substring:
 * `allow create: if false;` aparece quatro vezes no arquivo, e "está num texto que contém
 * match /tournaments/..." casaria com todas elas. */
function blocosMatch(mascarado) {
  const blocos = [];
  /* ⛔ O caminho CONTÉM chaves (`{tournamentId}`), então "vai até a primeira `{`" corta o
   * nome no meio: `match /tournaments/` casaria também com `/tournaments_summary/`, e o
   * contexto de uma entrada resolveria para o bloco errado — ou para nenhum, que foi o que
   * aconteceu na primeira versão desta função.
   * A chave que ABRE o bloco é a última da linha; o caminho é tudo antes dela. Se um dia
   * alguém escrever o `match` em duas linhas, o bloco simplesmente não é achado e o portão
   * reprova em voz alta — que é melhor que atribuir a âncora ao bloco errado em silêncio. */
  const re = /^[ \t]*match[ \t]+(.+?)[ \t]*\{[ \t]*$/gm;
  let m;
  while ((m = re.exec(mascarado)) !== null) {
    const abre = mascarado.indexOf('{', m.index + m[0].lastIndexOf('{'));
    let nivel = 0, fim = -1;
    for (let j = abre; j < mascarado.length; j++) {
      if (mascarado[j] === '{') nivel++;
      else if (mascarado[j] === '}') { nivel--; if (nivel === 0) { fim = j; break; } }
    }
    if (fim !== -1) blocos.push({ caminho: 'match ' + m[1].trim(), inicio: abre, fim: fim });
  }
  return blocos;
}

/** O bloco `match` mais interno que contém a posição — é dele que a âncora é filha DIRETA. */
function _matchDireto(blocos, pos) {
  let melhor = null;
  blocos.forEach((b) => {
    if (pos <= b.inicio || pos >= b.fim) return;
    if (!melhor || b.inicio > melhor.inicio) melhor = b;
  });
  return melhor;
}

/**
 * Valida UMA entrada contra a fonte. Devolve lista de erros (vazia = passou).
 * Toda mensagem carrega `incidente` e `data`: reprovar sem ensinar não serve de nada.
 */
function validarFonte(fonte, entrada, tipoArquivo) {
  const erros = [];
  const onde = '[' + entrada.id + '] ' + entrada.arquivo;
  const porque = ' — INCIDENTE (' + entrada.data + '): ' + entrada.incidente;

  if (!entrada.incidente || !entrada.data) {
    erros.push(onde + ': entrada sem `incidente`/`data` — mensagem de falha sem o caso não ensina nada');
    return erros;
  }
  if (/['"]/.test(entrada.ancora)) {
    erros.push(onde + ': a âncora contém texto entre aspas. O leitor mascara strings, então ela '
      + 'nunca casaria — âncora é feita de CÓDIGO.' + porque);
    return erros;
  }
  if (entrada.ocorrencia !== undefined &&
      !(Number.isInteger(entrada.ocorrencia) && entrada.ocorrencia >= 1)) {
    erros.push(onde + ': `ocorrencia` tem de ser inteiro >= 1.' + porque);
    return erros;
  }

  let lido;
  try { lido = ler(fonte, tipoArquivo); }
  catch (e) { erros.push(onde + ': ' + e.message + porque); return erros; }

  let posicoes = _posicoes(lido.mascarado, entrada.ancora);
  if (!posicoes.length) {
    erros.push(onde + ': a âncora `' + entrada.ancora + '` SUMIU do código. Ou o ponto foi '
      + 'removido de verdade — e aí o registro muda junto —, ou alguém o reescreveu sem a '
      + 'explicação.' + porque);
    return erros;
  }

  if (entrada.contexto) {
    const blocos = blocosMatch(lido.mascarado);
    const alvos = blocos.filter((b) => b.caminho === entrada.contexto);
    if (alvos.length !== 1) {
      erros.push(onde + ': o contexto `' + entrada.contexto + '` resolve para ' + alvos.length
        + ' blocos; tem de ser exatamente 1.' + porque);
      return erros;
    }
    const alvo = alvos[0];
    const dentro = posicoes.filter((p) => {
      const direto = _matchDireto(blocos, p);
      return direto && direto.inicio === alvo.inicio;
    });
    if (dentro.length !== 1) {
      erros.push(onde + ': dentro de `' + entrada.contexto + '` há ' + dentro.length
        + ' âncoras filhas diretas; tem de ser exatamente 1 — senão esta entrada protegeria '
        + 'uma e deixaria a outra nua.' + porque);
      return erros;
    }
    posicoes = dentro;
  } else if (posicoes.length > 1) {
    if (entrada.ocorrencia === undefined) {
      erros.push(onde + ': a âncora aparece ' + posicoes.length + ' vezes e a entrada não diz '
        + 'qual. Reprovar por ambiguidade é melhor que proteger o ponto errado em silêncio.' + porque);
      return erros;
    }
    if (entrada.ocorrencia > posicoes.length) {
      erros.push(onde + ': pedida a ocorrência ' + entrada.ocorrencia + ', mas só há '
        + posicoes.length + ' — o código mudou.' + porque);
      return erros;
    }
    posicoes = [posicoes[entrada.ocorrencia - 1]];
  } else if (entrada.ocorrencia !== undefined && entrada.ocorrencia !== 1) {
    erros.push(onde + ': pedida a ocorrência ' + entrada.ocorrencia + ', mas só há 1.' + porque);
    return erros;
  }

  const pos = posicoes[0];
  /* O comentário ADJACENTE: o último que termina antes da âncora, e entre ele e ela só pode
   * haver espaço em branco. ⛔ É pelos intervalos que o leitor devolveu, nunca por uma nova
   * busca no texto cru — seriam duas noções de "onde está o comentário". */
  let adjacente = null;
  lido.comentarios.forEach((c) => {
    if (c.fim > pos) return;
    if (!adjacente || c.fim > adjacente.fim) adjacente = c;
  });
  if (!adjacente || fonte.slice(adjacente.fim, pos).trim() !== '') {
    erros.push(onde + ': não há comentário COLADO na âncora. A explicação tem de ficar onde se '
      + 'mexe — perto não basta.' + porque);
    return erros;
  }
  if (adjacente.texto.indexOf(entrada.marca) === -1) {
    erros.push(onde + ': o comentário adjacente perdeu a marca «' + entrada.marca + '».' + porque);
  }
  return erros;
}

module.exports = { ler, lerJs, lerRules, blocosMatch, validarFonte };

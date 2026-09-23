'use strict';

/*
 * A MARCA DA CATEGORIA NUNCA SOBREVIVE A UMA MUDANÇA MANUAL.
 *
 * `skillBySport` guarda a categoria da pessoa por modalidade; `skillBySportSource`
 * guarda DE ONDE ELA VEIO — hoje só o valor `'letzplay'`, que significa "apurada no
 * histórico", em oposição a "declarada por alguém".
 *
 * ⛔ O DEFEITO QUE ESTE NÚCLEO FECHA: as portas do servidor que MUDAM a categoria não
 * tocavam na marca. Uma categoria digitada por cima de uma apurada mantinha o selo, e o
 * perfil passava a dizer "apurada" sobre um valor que alguém escreveu à mão. Dado podre
 * que ninguém lê HOJE, e que mente no dia em que alguém ler.
 *
 * ⛔ ELE SÓ APAGA. Nunca atribui `'letzplay'` — atribuir é privilégio de quem tem a
 * evidência (o scan), e isso vive noutro lugar. Um reconciliador que atribuísse
 * fabricaria procedência, que é exatamente o abuso que a marca deveria impedir.
 *
 * ⛔ E SÓ NAS MODALIDADES MEXIDAS. Apagar o mapa inteiro derrubaria a marca de esportes
 * que ninguém tocou — conserto que estraga mais do que arruma.
 *
 * ⚠️ O que este núcleo NÃO faz: tornar a marca confiável. `skillBySportSource` continua
 * gravável pelo navegador (ela não está em `serverOwnedProfileFields()`), e
 * `applyLetzplayScans` continua atribuindo a partir de scan sem procedência. Isso é a leva
 * da procedência, não esta. [[project_email_no_doc_publico]] é da mesma família: campo que
 * parece inofensivo porque nenhuma tela o lê.
 *
 * ⛔ DOIS CONTRATOS, porque a pergunta é diferente:
 *   `reconciliar(anterior, novo, fonteAnterior)`  — UM lado: a categoria mudou ou saiu?
 *   `reconciliarMerge({ ... })`                   — DOIS lados: de qual deles é a marca?
 *
 * ⛔ ESTE ARQUIVO VIAJA. Ele nasce aqui e é COPIADO para `functions-autodraw/vendor/` pelo
 * `copy-vendor.js`, porque os dois deploys têm raízes independentes e um
 * `require('../functions/…')` de lá NÃO ESTARIA no artefato publicado. O nome está em
 * `DE_FUNCTIONS`, que é a mesma lista que o `check-vendor-fresh.js` confere byte a byte no
 * `npm test` — sem isso, o teste rodaria a cópia velha e o deploy publicaria outra.
 */

function plain(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

/* Mapa defensivo: entrada ausente, nula ou de tipo errado vira `{}`. ⛔ Nunca devolve a
 * referência recebida — quem chama grava o resultado, e mutar o documento lido de volta
 * produziria um "já estava assim" falso. */
function mapa(value) {
  return plain(value) ? Object.assign({}, value) : {};
}

/* Categoria só CONTA quando é texto não vazio. `''`, `null` e `0` são ausência: é assim que
 * `applyEnrollmentAssignments` "descategoriza" alguém. */
function cat(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

/*
 * UM LADO — a pessoa (ou o organizador) mudou a categoria de alguma modalidade.
 *
 * `anterior`: `skillBySport` como está no documento;
 * `novo`:     `skillBySport` como vai ficar;
 * `fonteAnterior`: `skillBySportSource` como está.
 *
 * Devolve a fonte NOVA: a entrada de toda modalidade ALTERADA ou REMOVIDA sai; a das
 * intocadas fica.
 *
 * ⚠️ Marca ÓRFÃ de modalidade que ninguém tocou (nem no anterior, nem no novo) FICA. Ela é
 * lixo, mas limpá-la aqui seria agir fora do que a chamada mexeu — e é justamente isso que
 * o "só as modalidades mexidas" proíbe. Quem a limpa é a porta que ACRESCENTA aquela
 * modalidade: aí ela deixou de ser órfã e a regra de "alterada" se aplica.
 */
function reconciliar(anterior, novo, fonteAnterior) {
  const antes = mapa(anterior);
  const depois = mapa(novo);
  const fonte = mapa(fonteAnterior);
  const mexidas = new Set(Object.keys(antes).concat(Object.keys(depois)));
  mexidas.forEach((sport) => {
    if (cat(antes[sport]) !== cat(depois[sport])) delete fonte[sport];
  });
  return fonte;
}

/*
 * DOIS LADOS — fusão de contas. `keep` é a conta que SOBREVIVE, `drop` a absorvida.
 *
 * A REGRA: a marca só sobrevive se vier do MESMO LADO cuja categoria venceu E continuar
 * ligada ao MESMO VALOR. Qualquer outro caso ⇒ apaga.
 *
 * ⛔ NO EMPATE, `keep` VENCE SEMPRE, e nunca se completa com `fonteDrop`. Então
 * `keep=letzplay / drop=ausente` CONSERVA, e `keep=ausente / drop=letzplay` fica SEM MARCA.
 * ⚠️ A primeira versão desta regra apagava quando as marcas DIFERIAM — e isso perdia
 * procedência VÁLIDA: a marca do lado que venceu, descartada só porque o outro lado tinha
 * outra. [[feedback_chave_de_espelho_nunca_e_posicao]] é a mesma confusão: o que identifica
 * a marca é DE QUEM ela é, não que ela exista.
 *
 * ⛔ O que isso impede é o defeito que o motor de e-mail tem hoje: ele funde os dois mapas
 * como objetos independentes, então a marca da absorvida cola numa categoria CONFLITANTE da
 * sobrevivente — o selo de uma prova em cima de um valor que aquela prova nunca viu.
 *
 * ⛔ Também não inventa nada: quando a modalidade existe SÓ na absorvida, a marca dela vai
 * junto porque já estava PAREADA com aquele valor. Transportar par não é atribuir.
 */
function reconciliarMerge(input) {
  const dados = plain(input) ? input : {};
  const catKeep = mapa(dados.categoriaKeep);
  const catDrop = mapa(dados.categoriaDrop);
  const fonteKeep = mapa(dados.fonteKeep);
  const fonteDrop = mapa(dados.fonteDrop);
  const final = mapa(dados.categoriaFinal);
  const fonte = {};
  Object.keys(final).forEach((sport) => {
    const valor = cat(final[sport]);
    if (!valor) return;                       // categoria vazia no final: marca não tem no que grudar
    if (cat(catKeep[sport])) {
      // O lado que sobrevive tem categoria nesta modalidade: só a marca DELE pode ficar.
      if (fonteKeep[sport] && cat(catKeep[sport]) === valor) fonte[sport] = fonteKeep[sport];
      return;
    }
    // Modalidade que só existe na absorvida: a marca dela viaja, se estiver pareada.
    if (fonteDrop[sport] && cat(catDrop[sport]) === valor) fonte[sport] = fonteDrop[sport];
  });
  return fonte;
}

module.exports = { reconciliar, reconciliarMerge };

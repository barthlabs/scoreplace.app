'use strict';
/* ⛔⛔ O REGISTRO DOS PONTOS QUE JÁ REGREDIRAM (ordem do dono, 24/set/2026).
 *
 * _"criem regras e travas para que isso sempre seja feito e quem sabe assim paramos de ter
 *  regressões, com anotações no código de como as coisas devem ser e funcionar."_
 *
 * Cada entrada diz: onde está o ponto frágil (`ancora`, um trecho do CÓDIGO REAL), o que a
 * anotação ao lado dele tem de conter (`marca`), e POR QUE ele é frágil (`incidente`/`data`).
 * O portão `tests/pontos-frageis-tem-anotacao.test.js` reprova quando a âncora sumiu ou
 * quando a anotação adjacente perdeu a marca.
 *
 * ⛔ Âncora é feita de CÓDIGO, nunca de texto entre aspas: o leitor mascara strings e
 * comentários antes de procurar, então uma âncora com string jamais casaria.
 * ⛔ Registro é para o que JÁ QUEBROU, não para "tudo que parece importante": lista inflada
 * vira ruído e ensina a ignorar, que é o contrário do que ele pediu.
 */
const F = 'js/firebase-db.js', D = 'js/views/tournaments-draw.js';
const E = 'js/views/tournaments-enrollment.js', U = 'js/views/tournaments-utils.js';
const R = 'firestore.rules';
const RESULTS = 'match /results/{matchId}';
/* ⛔ A âncora é a LINHA INTEIRA, não o pedaço do meio: a anotação tem de ficar colada, e
 * "colado" significa que entre o fim do comentário e a âncora só há espaço em branco. Uma
 * âncora no meio da linha teria `if (orgUid && ` na frente e nunca seria adjacente a nada. */
const ORG_UID = 'if (orgUid && orgUid !== (user && user.uid)) {';
const AVISO = 'o aviso decidia por E-MAIL: quem entrou por conta Google nao recebia, e torneio '
            + 'antigo sem e-mail do organizador nao avisava ninguem';
const RESULT_INC = 'o cliente escrevia o resultado do jogo direto no documento';
const RESULT_MARCA = 'RESERVADOS A PROCESSO PRIVILEGIADO';

module.exports = [
  { id: '1', arquivo: F, ancora: '_callFnMarca:', marca: 'A CASA DO TRANSPORTE CALLABLE É AQUI',
    incidente: 'a unificacao do transporte inverteu a dependencia e a tela de inscritos parou de abrir',
    data: '2026-09-24' },
  { id: '2', arquivo: F, ancora: 'async _callFn(name, payload, msgs)', marca: 'E NÃO PODE SAIR DAQUI',
    incidente: 'idem — e o comentario legado ainda dizia que esta funcao delegava na casca',
    data: '2026-09-24' },
  { id: '3', arquivo: D, ancora: 'window._callCF = function', marca: 'ISTO É CASCA',
    incidente: 'a casca voltou a ter implementacao propria e as duas divergiram',
    data: '2026-09-24' },
  /* ⛔ A âncora começa no INÍCIO da linha e PARA no `===`: o que vem depois é um literal de
   * string, e o leitor mascara strings — a âncora completa nunca casaria. Começar no meio da
   * linha também não serve: "colado" exige que entre o comentário e a âncora só haja espaço. */
  { id: '4', arquivo: D, ancora: 'if (DB && DB._callFnMarca ===', marca: 'CACHE HÍBRIDO',
    incidente: 'aba velha em cache servia a casca sem a casa: sem o marcador, recursao infinita',
    data: '2026-09-24' },
  { id: '5', arquivo: E, ancora: ORG_UID, ocorrencia: 1, marca: 'QUEM DECIDE É O UID',
    incidente: AVISO + ' (inscricao INDIVIDUAL)', data: '2026-09-24' },
  { id: '6', arquivo: E, ancora: ORG_UID, ocorrencia: 2, marca: 'QUEM DECIDE É O UID',
    incidente: AVISO + ' (inscricao de DUPLA)', data: '2026-09-24' },
  { id: '7', arquivo: E, ancora: ORG_UID, ocorrencia: 3, marca: 'QUEM DECIDE É O UID',
    incidente: AVISO + ' (CANCELAMENTO)', data: '2026-09-24' },
  { id: '8', arquivo: E, ancora: 'if (!result || result.notFound) return;',
    marca: 'O AVISO EXIGE QUE A SAÍDA TENHA ACONTECIDO',
    incidente: 'avisava cancelamento que nao aconteceu', data: '2026-09-24' },
  { id: '9', arquivo: R, ancora: 'allow create: if false;', contexto: 'match /tournaments/{tournamentId}',
    marca: 'CREATE: FECHADO', incidente: 'o cliente criava o torneio direto no banco',
    data: '2026-09-23' },
  { id: '10', arquivo: R, ancora: 'allow create: if false;', contexto: RESULTS,
    marca: RESULT_MARCA, incidente: RESULT_INC, data: '2026-09-23' },
  { id: '10b', arquivo: R, ancora: 'allow update: if false;', contexto: RESULTS,
    marca: RESULT_MARCA, incidente: RESULT_INC, data: '2026-09-23' },
  { id: '10c', arquivo: R, ancora: 'allow delete: if false;', contexto: RESULTS,
    marca: RESULT_MARCA, incidente: RESULT_INC, data: '2026-09-23' },
  { id: '11', arquivo: U, ancora: 'window._isLigaFormat = function', marca: 'CASA ÚNICA',
    incidente: 'a resposta "e Liga?" estava espalhada e as copias divergiram', data: '2026-09-23' },
  { id: '13', arquivo: 'js/store.js', ancora: 'window._souOrganizador = function (t) {',
    marca: 'A CASCA da pergunta', incidente: 'a mesma guarda estava copiada a mao em 38 telas, e uma '
      + 'delas chamava por APELIDO e escapava da busca pelo nome do objeto', data: '2026-09-24' },
  { id: '14', arquivo: 'js/views/bracket-ui.js', ancora: 'function _isUserOrgOrCoHost(t, user) {',
    marca: 'NÃO HÁ MAIS QUEDA POR E-MAIL AQUI',
    incidente: 'o comentario-cabecalho descrevia uma queda por e-mail que ja nao existia, e me '
      + 'levou a conclusao errada: eu li o comentario e nao o codigo', data: '2026-09-24' },
  { id: '12', arquivo: U, ancora: 'window._faseCorrenteEhLiga = function', marca: 'AINDA SEM CHAMADOR',
    incidente: 'funcao criada na unificacao e nunca chamada — sem a nota, sai como codigo morto',
    data: '2026-09-23' }
];

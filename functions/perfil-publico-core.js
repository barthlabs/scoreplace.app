/* O QUE É PÚBLICO DE UM PERFIL — regra pura, num lugar só.
 *
 * ⛔ O PROBLEMA QUE ISTO EXISTE PARA RESOLVER. `users/{uid}` tem
 * `allow read: if request.auth != null` — qualquer pessoa logada lê o documento INTEIRO de
 * qualquer outra. MEDIDO em 13/set/2026: **279 perfis, 94 campos, 260 e-mails, 180 celulares
 * e 101 datas de nascimento**, inclusive os **131 perfis que marcaram "não mostrar meu
 * e-mail"**.
 *
 * ⛔ E NÃO DÁ PARA CONSERTAR COM REGRA: as Rules do Firestore autorizam DOCUMENTOS, não
 * projetam CAMPOS. Não existe liberar `displayName` e reter `phone` no mesmo documento —
 * toda restrição de campo hoje é do lado do cliente, e lado do cliente não é fronteira.
 * A saída é MOVER o dado de lugar, e é o que este espelho faz.
 *
 * ⭐ TEM PRECEDENTE NESTE REPOSITÓRIO: `tournaments_summary` é exatamente isto — escrito só
 * pela Function, `allow write: if false`, lido pelo cliente.
 *
 * ⚠️ O QUE FICA DE FORA É A DECISÃO, não o que entra. Ficam de fora `email`, `email_lower`,
 * `phone`, `linkedEmails`, `linkedPhones`, `fcmToken`, `preferredCeps` e tudo mais: o espelho
 * é uma LISTA DE PERMISSÃO, então campo novo no perfil nasce PRIVADO por padrão — o contrário
 * (lista de negação) esquece o campo que ainda não existe.
 *
 * ⚠️ `birthDate` ENTRA, e é uma escolha consciente: o desempate por antiguidade/juventude do
 * organizador lê a data de OUTROS jogadores. Tirá-la quebraria o critério; mantê-la não piora
 * nada (hoje ela já é legível por qualquer autenticado). Fica anotado como o campo a revisitar
 * se um dia o desempate mudar para o servidor.
 *
 * ⚠️ `mergedInto` ENTRA porque sem ele a lápide volta a parecer pessoa: `_userVivo` é a porta
 * única da conta viva e lê este campo no cliente. [[project_lapide_mergedinto_e_carga_nao_lixo]]
 */
'use strict';

const CAMPOS_PUBLICOS = [
  'displayName', 'displayName_lower', 'photoURL',
  'gender', 'skillBySport', 'defaultCategory', 'birthDate',
  'acceptFriendRequests', 'preferredSports',
  /* ⛔ `mergedAt` SAIU em 13/set/2026. Duas razões, as duas medidas: ZERO leitores no
   * cliente (varredura de `js/`), e o campo tem DOIS TIPOS em produção — `Timestamp` nos
   * merges feitos pela CF e `string` nos antigos. Campo sem leitor é superfície; campo sem
   * leitor E com dois tipos é a armadilha pronta para quem for lê-lo primeiro.
   * ⚠️ `mergedInto` FICA: é ele que `_userVivo` segue para não mostrar lápide como pessoa. */
  'mergedInto',
  'lastSeenAt', 'updatedAt', 'createdAt',
  /* ⭐ PREFERÊNCIA DE AVISO não é dado pessoal — é ajuste de canal, e QUEM MANDA precisa
   * dela para decidir se manda. Sem isto no espelho, avisar alguém obrigaria a ler o
   * documento inteiro (com e-mail e telefone) só para saber se a pessoa quer ser avisada —
   * que é exatamente a leitura que esta frente existe para acabar. */
  'notifyLevel', 'notifyPlatform', 'notifyEmail', 'liveAlerts', 'liveAlertsWho',
  /* ⚠️ OS TRÊS ABAIXO ENTRARAM EM 13/set/2026, E O CRITÉRIO FOI SEMPRE O MESMO: nenhum é
   * dado de CONTATO — que é o que este espelho existe para reter —, os três já são legíveis
   * hoje por qualquer pessoa autenticada (o documento inteiro é), e cada um sustenta uma
   * tela que quebraria sem ele. Ou seja: incluí-los NÃO amplia o que se vê; o que muda é que
   * quem vê para de baixar os outros 90 campos junto.
   *   • `city` (98 de 279 perfis) — a ficha pública do jogador mostra a cidade onde ele joga.
   *   • `_trophyIds` (237 de 279, média 3,9 · máx 15) — a tela de comparar troféus com um
   *     amigo EXISTE para mostrar isto; sem o campo ela baixava a ficha de até 20 pessoas.
   *   • `letzplayHandle` (26 de 279) — é um @ público de outra plataforma, por natureza.
   * ⛔ SE O DONO DISCORDAR DE QUALQUER UM: tirar é apagar a linha e re-semear; o espelho é
   * derivado, nada se perde. [[project_email_no_doc_publico]] */
  'city', '_trophyIds', 'letzplayHandle',
  /* ⚠️ E MAIS DOIS, achados SEGUINDO O LEITOR em vez de adivinhando: o ranking entre amigos
   * ("quem jogou mais", "quem fez mais check-in") lê `_rankStats` e `xpSnapshot`, e sem eles
   * ele baixaria a ficha inteira dos amigos para somar contador de jogo.
   *   • `_rankStats` (275 de 279) — objeto com QUATRO chaves, todas contador:
   *     casualMatchesPlayed, checkinsTotal, tournamentWins, tournamentsEnrolled.
   *   • `xpSnapshot` (0 de 279) — ninguém tem hoje. Entra assim mesmo: incluir um número que
   *     ninguém tem custa zero, e DEIXAR DE FORA cria armadilha — no dia em que alguém
   *     começar a escrevê-lo, o ranking leria `undefined` e mostraria zero, sem erro nenhum. */
  '_rankStats', 'xpSnapshot',
];

/* ⛔ A LISTA DE VETO existe só para o PORTÃO cobrar, não para filtrar: filtrar por veto é o
 * desenho que esquece o campo novo. Se algum dia um destes aparecer em CAMPOS_PUBLICOS, o
 * teste quebra — que é o objetivo. */
const NUNCA_PUBLICO = [
  'email', 'email_lower', 'phone', 'phoneCountry', 'phoneSetBy', 'phoneSource', 'phoneSetAt',
  'linkedEmails', 'linkedPhones', 'linkedUids', 'fcmToken', 'preferredCeps',
  'accountEmailSig', 'emailVerified', 'omitEmail', 'omitPhone', 'plan',
];

/** O espelho de um documento de perfil. Devolve SÓ os campos permitidos que existem. */
function perfilPublico(perfil) {
  const p = perfil || {};
  const out = {};
  for (let i = 0; i < CAMPOS_PUBLICOS.length; i++) {
    const k = CAMPOS_PUBLICOS[i];
    if (p[k] !== undefined && p[k] !== null) out[k] = p[k];
  }
  return out;
}

/** Mudou algo que o espelho mostra? Evita reescrever o espelho a cada toque no perfil
 *  (e a cada toque o gatilho dispara — `lastSeenAt` sozinho já dispararia sempre). */
function espelhoPrecisaMudar(antes, depois) {
  const a = perfilPublico(antes || {});
  const b = perfilPublico(depois || {});
  const chaves = Object.keys(a).concat(Object.keys(b));
  for (let i = 0; i < chaves.length; i++) {
    const k = chaves[i];
    // ⚠️ `lastSeenAt` e `updatedAt` NÃO contam como mudança: são carimbo de presença e
    // mudariam a cada abertura do app, fazendo o espelho reescrever sem nada novo na tela.
    if (k === 'lastSeenAt' || k === 'updatedAt') continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) return true;
  }
  return false;
}

module.exports = { CAMPOS_PUBLICOS, NUNCA_PUBLICO, perfilPublico, espelhoPrecisaMudar };

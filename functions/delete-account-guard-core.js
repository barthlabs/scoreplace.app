/* PORTA DA EXCLUSÃO DE CONTA — quem tem jogo pendente não some do torneio.
 *
 * POR QUE EXISTE (ordem do dono, ago/2026, depois do caso Denise Mamesso):
 * "numa situacao dessa, nao deveria permitir. deveria avisar a pessoa que ela
 *  esta inscrita em torneio e com jogos pendentes. ela precisa se desinscrever
 *  do torneio antes e com isso recebe o wo, e dai pode apagar a conta."
 *
 * O QUE ACONTECEU SEM ISTO: ela apagou a conta estando SORTEADA no R1 Grupo A do
 * Confra, com 3 jogos marcados e nenhum placar. O cascade tirou o uid dela de
 * dentro da chave e deixou o nome — o grupo ficou com um jogador fantasma, os
 * outros 3 sem adversária, e o organizador NÃO FOI AVISADO de nada.
 *
 * A REGRA, e por que ela é justa: apagar a conta é direito da pessoa e continua
 * garantido — só deixa de ser um atalho que quebra o torneio dos OUTROS. O
 * caminho é: desinscrever (que dispara o W.O. e avisa o organizador) → apagar.
 * Duas ações explícitas, cada uma com a consequência à vista.
 *
 * ⚠️ SÓ BLOQUEIA JOGO DE VERDADE. Folga (isSitOut) e BYE não são jogo dela;
 * torneio encerrado/cancelado não prende ninguém; e fase NÃO SORTEADA também
 * não — sem sorteio a inscrição sai limpa e não há chave pra quebrar (é o que o
 * próprio deleteAccount já fazia certo).
 */
'use strict';

function _uidsDoSlot(m, lado) {
  const arr = m[lado + 'Uids'];
  if (Array.isArray(arr)) return arr.filter(Boolean);
  const solo = m[lado === 'team1' ? 'p1Uid' : 'p2Uid'];
  return solo ? [solo] : [];
}

/* A pessoa tem jogo PENDENTE (sem resultado) neste torneio? */
function temJogoPendente(t, uid) {
  if (!t || !uid) return false;
  const st = String(t.status || '').toLowerCase();
  if (st === 'finished' || st === 'cancelled' || st === 'canceled') return false;

  const jogos = [];
  (t.rounds || []).forEach((r) => (r && r.matches ? jogos.push(...r.matches) : null));
  if (Array.isArray(t.matches)) jogos.push(...t.matches);
  if (t.thirdPlaceMatch) jogos.push(t.thirdPlaceMatch);

  return jogos.some((m) => {
    if (!m || m.isSitOut || m.isBye) return false;           // folga/BYE não é jogo dela
    if (m.winner || m.winnerUid) return false;                // já decidido
    if (Array.isArray(m.sets) && m.sets.length) return false; // tem placar lançado
    const meus = _uidsDoSlot(m, 'team1').concat(_uidsDoSlot(m, 'team2'));
    return meus.indexOf(uid) !== -1;
  });
}

/**
 * Torneios que BLOQUEIAM a exclusão. Devolve [{ id, name, jogos }].
 * `jogos` é a contagem de pendentes — é o que a mensagem mostra pra pessoa.
 */
function torneiosQueBloqueiam(tournaments, uid) {
  return (tournaments || []).filter((t) => temJogoPendente(t, uid)).map((t) => {
    let n = 0;
    const jogos = [];
    (t.rounds || []).forEach((r) => (r && r.matches ? jogos.push(...r.matches) : null));
    if (Array.isArray(t.matches)) jogos.push(...t.matches);
    if (t.thirdPlaceMatch) jogos.push(t.thirdPlaceMatch);
    jogos.forEach((m) => {
      if (!m || m.isSitOut || m.isBye || m.winner || m.winnerUid) return;
      if (Array.isArray(m.sets) && m.sets.length) return;
      if (_uidsDoSlot(m, 'team1').concat(_uidsDoSlot(m, 'team2')).indexOf(uid) !== -1) n++;
    });
    return { id: t.id || null, name: String(t.name || 'torneio'), jogos: n };
  });
}

/* A mensagem que a pessoa lê. Diz ONDE ela está presa e QUAL é o caminho —
 * mensagem que só diz "não pode" vira suporte. */
function mensagemBloqueio(lista) {
  const nomes = (lista || []).map((x) => '“' + x.name + '”' + (x.jogos ? ' (' + x.jogos + ' jogo' + (x.jogos > 1 ? 's' : '') + ' pendente' + (x.jogos > 1 ? 's' : '') + ')' : ''));
  const alvo = nomes.length === 1 ? nomes[0] : nomes.slice(0, -1).join(', ') + ' e ' + nomes[nomes.length - 1];
  return 'Você ainda tem jogos marcados em ' + alvo + '. ' +
    'Saia do torneio primeiro (você recebe W.O. nos jogos pendentes e o organizador é avisado) — ' +
    'depois disso a exclusão da conta fica liberada.';
}

module.exports = { temJogoPendente, torneiosQueBloqueiam, mensagemBloqueio };

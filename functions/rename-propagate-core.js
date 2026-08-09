/* PROPAGAÇÃO DE NOME — quando a pessoa troca o displayName, o rótulo gravado
 * nos torneios passa a mentir. Este módulo decide O QUE reescrever, e é PURO
 * (sem Firestore) porque é aqui que dói errar: reescrever o rótulo errado
 * renomeia OUTRA PESSOA dentro do jogo.
 *
 * POR QUE EXISTE (ordem do dono, ago/2026): "quando a pessoa troca o nome de
 * perfil, isso tem que ser atualizado em todo o banco de dados".
 * MEDIDO na base antes de escrever uma linha: 495 slots guardam (uid + rótulo);
 * 14 estavam desatualizados, de 5 pessoas, todos no Confra —
 *   Fabi2401@→Dani Bataglia · Marina Turri→Marina Cegal · Mariana C→Mariana
 *   Ciocci · RODRIGO UNGER PIRES DA SILVA→Rodrigo Unger · Adriana→Adriana Rosa.
 *
 * ⚠️ ISTO NÃO SUBSTITUI RESOLVER POR UID NA TELA — complementa.
 * O cânone segue [[project_uid_identity_canon_locked]]: LÓGICA e EXIBIÇÃO casam
 * por uid, nunca por rótulo. A propagação nunca é completa nem instantânea (doc
 * escrito offline, torneio antigo, jogador fictício sem conta, escrita que falha
 * no meio), então quem depender do rótulo volta a quebrar na primeira janela.
 * Aqui a gente limpa o lixo; a rede continua sendo o uid.
 *
 * REGRA DE OURO: só reescreve slot cujo UID É o da pessoa. NUNCA casa por nome —
 * casar por nome é exatamente o bug que originou tudo isto (dois homônimos
 * seriam renomeados juntos, e o rótulo velho de um viraria o nome do outro).
 */
'use strict';

// separador canônico do rótulo de dupla ("A / B") — o mesmo que o app monta.
var SEP = ' / ';

function _isStr(x) { return typeof x === 'string' && x.length > 0; }

/* Reescreve, num array de nomes emparelhado com um array de uids, as posições
 * cujo uid é o da pessoa. Devolve quantas trocou. Arrays de tamanhos DIFERENTES
 * são recusados por inteiro — ver o porquê logo abaixo. */
function _rewritePaired(nomes, uids, uid, novo, mudancas, path, avisos) {
  if (!Array.isArray(nomes) || !Array.isArray(uids)) return 0;
  // ⚠️ DESALINHAMENTO = NÃO MEXE. O par nome[i]/uid[i] só vale se os dois arrays
  // tiverem o MESMO tamanho. MEDIDO em produção (Confra, 08/ago/2026): a saída da
  // Denise Mamesso removeu o uid dela de `playersUids` e de 3 `team*Uids` e DEIXOU
  // o nome em `players`/`team2` → 4 entradas de nome pra 3 de uid. Ali o uid que
  // saiu era o ÚLTIMO e os índices restantes ainda casavam; se tivesse saído do
  // MEIO, casar por índice renomearia OUTRA PESSOA — o desfecho exato que este
  // módulo existe pra impedir. Não dá pra adivinhar de quem é o nome sobrando:
  // NÃO GRAVAR é melhor que gravar na pessoa errada (mesma regra da v1.7.45).
  if (nomes.length !== uids.length) {
    if (avisos) avisos.push({ path: path, nomes: nomes.length, uids: uids.length });
    return 0;
  }
  var n = 0;
  for (var i = 0; i < nomes.length; i++) {
    if (uids[i] !== uid) continue;          // ← identidade: uid, sempre
    if (!_isStr(nomes[i]) || nomes[i] === novo) continue;
    mudancas.push({ path: path + '[' + i + ']', de: nomes[i], para: novo });
    nomes[i] = novo;
    n++;
  }
  return n;
}

/* p1/p2 do jogo são DERIVADOS: em dupla é "A / B" (join de team1/team2), em
 * individual é o nome puro. Depois de mexer no array, reconstrói o rótulo —
 * mas SÓ se ele ainda for o join antigo. Se alguém editou o p1 à mão (ou o
 * schema é outro), não inventamos: deixa como está e reporta. */
function _resyncSlotLabel(m, slot, teamKey, mudancas, prefixo) {
  var team = m[teamKey];
  if (!Array.isArray(team) || !team.length) return 0;
  var novo = team.join(SEP);
  if (!_isStr(m[slot]) || m[slot] === novo) return 0;
  // path COMPLETO de propósito: é ele que alimenta camposTocados(), e camposTocados
  // guia a escrita SELETIVA. Um path 'p1' solto viraria "campo de topo p1" e a
  // escrita mandaria um campo que não existe na raiz do doc.
  mudancas.push({ path: prefixo + slot, de: m[slot], para: novo });
  m[slot] = novo;
  return 1;
}

/**
 * planRename(t, uid, novoNome) — MUTA o torneio `t` (passe uma cópia se quiser
 * dry-run) e devolve { mudancas: [], total }. Não escreve nada.
 */
function planRename(t, uid, novoNome) {
  var mudancas = [];
  var avisos = [];
  if (!t || !_isStr(uid) || !_isStr(novoNome)) return { mudancas: mudancas, total: 0, avisos: avisos };

  function varreMatches(lista, prefixo) {
    (lista || []).forEach(function (m, mi) {
      if (!m) return;
      var p = prefixo + '[' + mi + '].';
      // duplas / Rei-Rainha: o par team{N} × team{N}Uids
      var mudouT1 = _rewritePaired(m.team1, m.team1Uids, uid, novoNome, mudancas, p + 'team1', avisos);
      var mudouT2 = _rewritePaired(m.team2, m.team2Uids, uid, novoNome, mudancas, p + 'team2', avisos);
      if (mudouT1) _resyncSlotLabel(m, 'p1', 'team1', mudancas, p);
      if (mudouT2) _resyncSlotLabel(m, 'p2', 'team2', mudancas, p);
      // individual: p1/p2 com o uid do próprio slot. Só quando o rótulo é de UMA
      // pessoa — rótulo composto ("A / B") é do time e sai pelo caminho de cima.
      [['p1', 'p1Uid'], ['p2', 'p2Uid']].forEach(function (par) {
        var slot = par[0], uk = par[1];
        if (m[uk] !== uid || !_isStr(m[slot])) return;
        if (m[slot].indexOf(SEP) !== -1) return;   // composto → não é rótulo de 1 pessoa
        if (m[slot] === novoNome) return;
        mudancas.push({ path: p + slot, de: m[slot], para: novoNome });
        m[slot] = novoNome;
      });
    });
  }

  (t.rounds || []).forEach(function (r, ri) {
    if (!r) return;
    varreMatches(r.matches, 'rounds[' + ri + '].matches');
    (r.monarchGroups || []).forEach(function (g, gi) {
      if (!g) return;
      _rewritePaired(g.players, g.playersUids, uid, novoNome, mudancas,
        'rounds[' + ri + '].monarchGroups[' + gi + '].players', avisos);
    });
  });
  varreMatches(t.matches, 'matches');

  // grupos de fase (subgroups) — mesmo par nome/uid quando existe
  (t.groups || []).forEach(function (g, gi) {
    if (!g) return;
    _rewritePaired(g.players, g.playersUids, uid, novoNome, mudancas, 'groups[' + gi + '].players', avisos);
  });

  // classificação: linha com uid próprio
  (t.standings || []).forEach(function (s, si) {
    if (!s || s.uid !== uid || !_isStr(s.name) || s.name === novoNome) return;
    mudancas.push({ path: 'standings[' + si + '].name', de: s.name, para: novoNome });
    s.name = novoNome;
  });

  return { mudancas: mudancas, total: mudancas.length, avisos: avisos };
}

/* Campos de topo que o plano toca — pra escrita seletiva (nunca gravar o doc
 * inteiro: outra aba pode ter mudado placar no meio). */
function camposTocados(mudancas) {
  var set = {};
  (mudancas || []).forEach(function (c) { set[String(c.path).split(/[.[]/)[0]] = 1; });
  return Object.keys(set);
}

module.exports = { planRename: planRename, camposTocados: camposTocados, SEP: SEP };

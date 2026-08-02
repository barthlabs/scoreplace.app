// Núcleo PURO do torneio ABANDONADO — o que nunca foi concluído nem encerrado.
//
// Pedido do dono (02/ago/2026): _"torneios que claramente era para ser de 1 dia e nunca
// foram até a final e o organizador não clicou em encerrar. isso fica aparecendo para todos
// os usuários novos"_ · _"encerrar não deve fechar a classificação"_ · _"o organizador deve
// ser avisado 48h antes que se quiser manter ativo precisa preencher as datas"_ · _"o
// organizador pode reabrir depois de encerrado para conclusão colocando as datas"_ ·
// _"depois de encerrado, a única ferramenta ativa seria o reabrir torneio"_.
//
// MEDIDO EM PRODUÇÃO (02/ago/2026, 8 torneios vivos): 4 abandonados — e o mais gritante,
// "Torneio Misto FUTVOLEI" (12 de 19 jogos, parado desde 28/jun), **TEM data de término
// preenchida** e ela passou há 35 dias. Por isso a regra NÃO é "só quando a data de término
// está em branco": data de término vencida é o sinal MAIS FORTE que existe, não a exceção.
//
// Três formas de abandono, tratadas diferente de propósito:
//   • JOGOU E PAROU  → encerra (mas sem fechar classificação — ver `encerrar`).
//   • NUNCA JOGOU    → NÃO encerra: sai da vitrine. Encerrar um torneio que nunca aconteceu
//                      criaria um "finished" de pódio vazio e uma linha falsa na ficha de
//                      quem se inscreveu.
//   • JÁ ACABOU      → não é problema daqui: o auto-finish já fecha quando todo jogo tem placar.
//
// O prazo sai do RITMO DO PRÓPRIO TORNEIO, não de um número fixo: um torneio de 1 dia parado
// há 2 semanas está morto; um que legitimamente se estende por 3 semanas, não. Por isso
// `max(14 dias, 3 × janela)`, onde janela = último placar − primeiro.
//
// Puro e testável (functions/test-abandon-core.js). A CF sweepAbandonedTournaments decide com
// isto; a entrega (notificação + escrita) mora na CF.

var DIA = 86400000;
var FOLGA_APOS_FIM   = 7 * DIA;    // data de término venceu → ainda espera 1 semana
var OCIOSO_MINIMO    = 14 * DIA;   // sem data de término → piso de ociosidade
var FATOR_JANELA     = 3;          // ...ou 3× o tempo que o torneio levou, o que for maior
var AVISO_ANTES      = 2 * DIA;    // 48h de aviso ao organizador (pedido do dono)
var SEM_JOGO_SUMICO  = 30 * DIA;   // nunca teve placar → sai da vitrine

// Data em ms a partir do que o banco realmente guarda: ISO ('2026-07-25T...'), 'YYYY-MM-DD',
// ou epoch em NÚMERO — e medido no banco, às vezes em SEGUNDOS (resultAt = 1784988049).
// Nunca deixa `Date.parse` ver barra (ver [[project_date_parsing_canonical]]).
function msDe(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d+$/.test(String(v))) {
    var n = Number(v);
    if (!isFinite(n) || n <= 0) return null;
    return n < 1e12 ? n * 1000 : n;   // < 1e12 = segundos
  }
  var s = String(v);
  if (s.indexOf('/') >= 0) return null;             // formato ambíguo: não chuta
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) s = s + 'T23:59:59-03:00';   // dia inteiro, BRT
  var t = Date.parse(s);
  return isFinite(t) ? t : null;
}

function ehLiga(fmt) {
  var f = String(fmt || '').toLowerCase();
  return f === 'liga' || f === 'ranking' || f.indexOf('pontos corridos') >= 0;
}

function temChave(t) {
  return !!((t.matches && t.matches.length) || (t.rounds && t.rounds.length) || (t.groups && t.groups.length));
}

// t         — doc do torneio
// placares  — { comPlacar, primeiro, ultimo } (ms ou null), computado dos docs de `results`
// agoraMs   — instante da varredura
// → { acao, dueAt, motivo }
//   acao: 'nada' | 'avisar' | 'encerrar' | 'foraDaVitrine'
function computeAbandon(t, placares, agoraMs) {
  var nada = { acao: 'nada', dueAt: null, motivo: '' };
  if (!t) return nada;
  if (t.status === 'finished') return nada;                       // já encerrado
  // LIGA/PONTOS CORRIDOS NUNCA: é temporada contínua — passa semanas sem jogo por desenho, e
  // já tem expiração própria (ligaSeasonMonths). Encerrar Liga por ociosidade seria bug.
  if (ehLiga(t.format)) return { acao: 'nada', dueAt: null, motivo: 'liga' };
  if (t.isSandbox === true) return { acao: 'nada', dueAt: null, motivo: 'sandbox' };

  var p = placares || {};
  var comPlacar = p.comPlacar || 0;

  // ── NUNCA JOGOU: nada pra encerrar. Só para de ocupar a vitrine. ──
  if (comPlacar === 0) {
    var nasceu = msDe(t.createdAt) || msDe(t.updatedAt);
    if (nasceu && (agoraMs - nasceu) >= SEM_JOGO_SUMICO) {
      return { acao: 'foraDaVitrine', dueAt: nasceu + SEM_JOGO_SUMICO,
               motivo: temChave(t) ? 'sorteado e nenhum placar lançado' : 'nunca saiu do papel' };
    }
    return nada;
  }

  // ── JOGOU E PAROU ──
  var ultimo = p.ultimo || null;
  if (!ultimo) return nada;                                        // sem quando, sem prazo
  var fim = msDe(t.endDate);
  var dueAt, motivo;
  if (fim && fim < agoraMs) {
    // A data de término é a palavra do PRÓPRIO organizador sobre quando acabaria. Placar
    // lançado depois dela conta: o torneio esticou, o relógio recomeça do último jogo.
    dueAt = Math.max(fim, ultimo) + FOLGA_APOS_FIM;
    motivo = 'data de término passou';
  } else if (fim) {
    return nada;                                                   // ainda dentro do prazo dele
  } else {
    var janela = Math.max(0, ultimo - (p.primeiro || ultimo));
    dueAt = ultimo + Math.max(OCIOSO_MINIMO, FATOR_JANELA * janela);
    motivo = 'sem data de término e parado desde o último placar';
  }

  if (agoraMs >= dueAt) return { acao: 'encerrar', dueAt: dueAt, motivo: motivo };
  if (agoraMs >= dueAt - AVISO_ANTES) return { acao: 'avisar', dueAt: dueAt, motivo: motivo };
  return { acao: 'nada', dueAt: dueAt, motivo: motivo };
}

// Texto do aviso de 48h. Diz A COISA QUE RESOLVE (preencher as datas), não só o problema.
function mensagemAviso(nome, dueAtMs) {
  var d = new Date(dueAtMs - 3 * 3600 * 1000);   // BRT
  var dia = String(d.getUTCDate()).padStart(2, '0') + '/' + String(d.getUTCMonth() + 1).padStart(2, '0');
  return 'O torneio "' + (nome || 'seu torneio') + '" está sem placar novo há um tempo e será ' +
         'encerrado automaticamente em ' + dia + '. Se ele ainda está rolando, é só preencher ' +
         'as datas de início e término que ele continua ativo.';
}

function mensagemEncerrado(nome) {
  return 'O torneio "' + (nome || 'seu torneio') + '" foi encerrado automaticamente por ' +
         'inatividade. A classificação NÃO foi fechada — se ainda houver jogos a fazer, ' +
         'reabra o torneio informando as datas e conclua normalmente.';
}

module.exports = {
  DIA: DIA, FOLGA_APOS_FIM: FOLGA_APOS_FIM, OCIOSO_MINIMO: OCIOSO_MINIMO,
  FATOR_JANELA: FATOR_JANELA, AVISO_ANTES: AVISO_ANTES, SEM_JOGO_SUMICO: SEM_JOGO_SUMICO,
  msDe: msDe, ehLiga: ehLiga, temChave: temChave,
  computeAbandon: computeAbandon,
  mensagemAviso: mensagemAviso, mensagemEncerrado: mensagemEncerrado
};

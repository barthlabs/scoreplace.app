'use strict';
/* ⛔⛔ AS LISTAS DERIVADAS DO TORNEIO TÊM DE BATER COM OS FATOS (24/set/2026).
 *
 * Pergunta do dono: _"porque vc acha que é a forma certa de trabalhar com um banco de dados?"_
 * O desenho guarda FATOS e deriva as respostas. Mas três listas são DERIVADAS E GRAVADAS,
 * porque a regra do Firestore não percorre lista de objetos filtrando por `status`:
 *   · `adminUids`   — criador + co-organizadores ativos (a regra decide por ela);
 *   · `adminEmails` — MORTA (LGPD, 25/set/2026): saiu do documento e saiu desta lista;
 *   · `memberUids`  — todo mundo que está no torneio (a regra decide por ela, e a LISTA
 *                     "meus torneios" consulta por ela).
 * Resposta guardada é onde nascem duas verdades. Logo: conferir, e consertar.
 *
 * ⛔ MONTA O TORNEIO DIVIDIDO ANTES DE COMPARAR. Na primeira medição eu comparei o documento
 * MAGRO e "achei" 6 divergências — o elenco mora em subcoleção, então o recomputo via elenco
 * vazio. Montando, sobrou 1, real. Comparar sem montar é inventar defeito.
 *
 * O que cada lado significa, e é diferente:
 *   · FALTA na lista → a pessoa ESTÁ no torneio e a regra a trata como estranha: não lança o
 *     próprio placar e não vê o torneio na lista dela;
 *   · SOBRA na lista → a pessoa NÃO está no torneio e a regra a deixa passar.
 *
 *   node conferir-derivados.js            # SECO
 *   node conferir-derivados.js --apply    # conserta
 */
const admin = require('firebase-admin');
const Co = require('../functions/cohost-core.js');
const En = require('../functions/enroll-core.js');
const Split = require('./vendor/tournament-split-core.js');

const LISTAS = [
  ['adminUids',   (t) => Co.computeAdminUids(t)],
  /* ⛔ `adminEmails` SAIU da conferência (LGPD, 25/set/2026): o campo não é mais gravado, e
   * conferir uma lista que deve deixar de existir fazia o `--apply` REGRAVAR o e-mail. */
  ['memberUids',  (t) => (typeof En.computeMemberUids === 'function' ? En.computeMemberUids(t) : null)],
];

/** Compara UMA lista. Devolve {falta, sobra} ou null quando não há como recomputar. */
function conferirLista(gravado, esperado) {
  if (!Array.isArray(esperado)) return null;
  const g = new Set((Array.isArray(gravado) ? gravado : []).map(String));
  const e = new Set(esperado.map(String));
  return { falta: [...e].filter((x) => !g.has(x)), sobra: [...g].filter((x) => !e.has(x)) };
}

/* ⛔⛔ O JOGO TEM DUAS CÓPIAS, COM O MESMO ID: a do MOTOR (que classifica e avança) e a do
 * CARD (que a tela e "Meus Resultados" leem). Divergirem significa a tela mostrar um placar e
 * a classificação usar outro. Ver [[project_jogo_vive_em_matches_e_results]].
 *
 * ⛔ AQUI É SÓ RELATÓRIO, nunca conserto automático: quando as duas divergem, decidir QUAL
 * vale é decisão de quem organizou o jogo, não regra que eu possa escrever. O relógio de cada
 * cópia é a pista de qual delas a tela estava lendo.
 *
 * ⛔ E o motor guarda jogo em TRÊS lugares: no documento (`matches`, `rounds`,
 * `monarchGroups`, `groups`, `phaseRounds`, terceiro lugar) E na subcoleção, quando o torneio
 * é dividido. Comparei só a subcoleção na primeira medição e "achei" 14 órfãos; olhando os
 * três, são 12 — todos de UM torneio encerrado e sem nenhuma conta envolvida. Auditoria de
 * jogo que olha um lugar só inventa defeito. */
function jogosDoMotor(t) {
  const mapa = new Map();
  const põe = (m) => { if (m && typeof m === 'object' && m.id) mapa.set(String(m.id), m); };
  (t.matches || []).forEach(põe);
  (t.rounds || []).forEach((r) => {
    ((r && r.matches) || []).forEach(põe);
    ((r && r.monarchGroups) || []).forEach((g) => ((g && g.matches) || []).forEach(põe));
  });
  (t.groups || []).forEach((g) => ((g && g.matches) || []).forEach(põe));
  if (t.thirdPlaceMatch) põe(t.thirdPlaceMatch);
  if (t.phaseRounds) Object.keys(t.phaseRounds).forEach((k) =>
    (((t.phaseRounds[k] || {}).rounds) || []).forEach((r) => ((r && r.matches) || []).forEach(põe)));
  return mapa;
}

/** Compara as duas cópias de um jogo. Devolve null quando batem. */
function conferirJogo(doMotor, doCard) {
  const norm = (v) => (v == null || v === '') ? null : String(v).trim();
  const sets = (x) => { const s = (x && (x.sets || x.setScores || x.score)) || null; return s ? JSON.stringify(s) : null; };
  if (norm(doMotor.winner) !== norm(doCard.winner)) {
    return 'vencedor: motor=' + norm(doMotor.winner) + ' · card=' + norm(doCard.winner);
  }
  const a = sets(doMotor), b = sets(doCard);
  if (a && b && a !== b) return 'placar difere entre motor e card';
  return null;
}

/* ⛔⛔ QUEM JOGA TEM DE ESTAR NO ELENCO — e por enquanto isto é DETECÇÃO, não trava.
 *
 * As regras do Firestore deixam o participante escrever `matches`/`rounds`/`classification`
 * (é assim que ele lança o próprio placar), e o idioma delas NÃO itera lista: não há como
 * exigir que os jogadores de um jogo que já existe continuem os mesmos.
 * ⛔ A ideia de carimbar uma impressão digital num campo fora da lista dele NÃO fecha o furo:
 * a regra sabe comparar "o campo mudou?", mas não sabe conferir se a impressão CORRESPONDE ao
 * que foi escrito. Quem reescrevesse os jogos e deixasse o carimbo quieto passaria. Isso é
 * DETECTOR, e detector não é portão — [[feedback_prova_para_pintar_nao_serve_para_recusar]].
 * ⇒ O fechamento de verdade é o lançamento de placar virar Cloud Function.
 *
 * MEDIDO em 24/set/2026, nos 78 torneios: **zero** contas jogando fora do elenco. O furo
 * existe e não foi usado — e dizer as duas coisas juntas é o que vale. */
function contasForaDoElenco(t, uidsDe) {
  const elenco = new Set();
  [t.participants, t.standbyParticipants, t.waitlist].forEach((a) =>
    (Array.isArray(a) ? a : []).forEach((p) => uidsDe(p).forEach((u) => elenco.add(u))));
  const nosJogos = new Set();
  const põe = (m) => {
    if (!m || typeof m !== 'object') return;
    ['team1Uids', 'team2Uids', 'playersUids'].forEach((k) =>
      (Array.isArray(m[k]) ? m[k] : []).forEach((u) => { if (u) nosJogos.add(String(u)); }));
    [m.team1Obj, m.team2Obj].forEach((o) => uidsDe(o).forEach((u) => nosJogos.add(u)));
  };
  jogosDoMotor(t).forEach(põe);
  /* ⛔ Sintético do W.O. e placeholder legado NÃO são conta e não estão no elenco por
   * desenho — contá-los aqui daria alarme falso em todo torneio que teve W.O. */
  return [...nosJogos].filter((u) => !elenco.has(u) && !/^(ghostwo_|jog_)/.test(u));
}

module.exports = { conferirLista, LISTAS, jogosDoMotor, conferirJogo, contasForaDoElenco };

if (require.main === module) {
  const apply = process.argv.indexOf('--apply') !== -1;
  admin.initializeApp();
  const db = admin.firestore();
  (async () => {
    const snap = await db.collection('tournaments').get();
    console.log((apply ? '▸ APLICANDO' : '▸ SECO (nada será gravado)') + ' — ' + snap.size + ' torneio(s)');
    let ruins = 0, consertados = 0;
    for (const d of snap.docs) {
      const t = d.data();
      let completo = t;
      if (Array.isArray(t._semPesados) && t._semPesados.length) {
        try {
          completo = await Split.montarDoBanco(JSON.parse(JSON.stringify(t)), async (col) => {
            const qs = await db.collection('tournaments').doc(d.id).collection(col).get();
            return qs.docs.map((x) => Object.assign({ id: x.id }, x.data()));
          });
        } catch (e) {
          /* ⛔ Sem montar não se compara: melhor não dizer nada que dizer errado. */
          console.log('  ⚠️ ' + d.id + ' · não montei as partes, PULADO: ' + (e && e.message));
          continue;
        }
      }
      const patch = {};
      const relatos = [];
      LISTAS.forEach(([campo, calc]) => {
        const r = conferirLista(t[campo], calc(completo));
        if (!r) return;
        if (r.falta.length || r.sobra.length) {
          relatos.push(campo + ': falta ' + r.falta.length + ' (está no torneio e a regra recusa)'
            + ' · sobra ' + r.sobra.length + ' (não está e a regra deixa)');
          patch[campo] = calc(completo);
        }
      });
      /* as duas cópias do jogo — relatório, nunca conserto (ver o bloco acima) */
      try {
        const rSnap = await db.collection('tournaments').doc(d.id).collection('results').get();
        if (rSnap.size) {
          const motor = jogosDoMotor(completo);
          let divergem = 0, semMotorComConta = 0, semMotor = 0;
          rSnap.forEach((x) => {
            const res = x.data() || {};
            const m = motor.get(x.id);
            if (!m) {
              semMotor++;
              if (Array.isArray(res.playerUids) && res.playerUids.length) semMotorComConta++;
              return;
            }
            const p = conferirJogo(m, res);
            if (p) { divergem++; console.log('  ⚠️ ' + d.id + '/' + x.id + ' · ' + p); }
          });
          if (semMotorComConta) {
            console.log('  ⚠️ ' + d.id + ' · ' + semMotorComConta + ' resultado(s) de gente COM CONTA sem jogo no motor');
          } else if (semMotor) {
            console.log('  · ' + d.id + ' · ' + semMotor + ' resultado(s) sem jogo no motor (ninguém com conta — histórico)');
          }
        }
      } catch (e) { console.log('  ⚠️ ' + d.id + ' · não conferi as cópias do jogo: ' + (e && e.message)); }

      /* quem joga sem estar no elenco — detecção, ver o bloco acima */
      try {
        const intrusos = contasForaDoElenco(completo, (p) => {
          try { return (require('./vendor/participant-identity.js').participantUids(p) || []).filter(Boolean).map(String); }
          catch (e) { return []; }
        });
        if (intrusos.length) console.log('  ⚠️ ' + d.id + ' · ' + intrusos.length + ' conta(s) jogando FORA do elenco');
      } catch (e) {}

      if (!relatos.length) continue;
      ruins++;
      console.log('  ⛔ ' + d.id + ' · ' + (t.name || '') + '\n       ' + relatos.join('\n       '));
      if (apply) {
        await db.collection('tournaments').doc(d.id).update(patch);
        consertados++;
      }
    }
    console.log('\n  divergentes: ' + ruins + (apply ? ' · consertados: ' + consertados : ''));
    if (!apply) { console.log('  (seco — rode com --apply para gravar)'); return; }
    console.log('✓ conserto aplicado; rode de novo em seco para conferir');
  })().catch((e) => { console.error(e); process.exit(1); });
}

/* O CARTÃO SAI IGUAL VINDO DO RESUMO OU DO DOCUMENTO COMPLETO.
 *
 * Ordem do dono: "cada card ser desenhado de forma leve e puxar as informações que
 * vão nele" · "nada da Confra pode mudar no que as pessoas veem".
 *
 * MEDIDO (base REAL, 39 torneios): documento do Confra 236 KB → resumo 11 KB; a base
 * inteira 421 KB → 62 KB (85% menos). A vitrine trazia até 51 documentos COMPLETOS —
 * com jogos, inscritos e histórico — pra desenhar cartões de duas linhas.
 *
 * ⛔ O QUE ESTE TESTE TRAVA: cartão que MUDA conforme a origem do dado. Um número
 * diferente já é regressão; o BOTÃO diferente ("Inscrever-se" onde deveria ser
 * "Sair") é pior — é ação errada oferecida à pessoa.
 */
const fs = require('fs');
const path = require('path');
const HARNESS = require('./render-harness');
const W = HARNESS.window;
const M = require('../functions-autodraw/tournament-summary-core.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── o cartão do resumo é igual ao do documento completo ────');

const helpers = M.helpersDe(W);
const resumoDe = (t) => M.buildSummary(t, t.id || t._docId, helpers);

const arr = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'prod-tournaments.json'), 'utf8'));
const lista = Array.isArray(arr) ? arr : (arr.tournaments || []);

// ── ① os números do cartão batem, torneio por torneio ───────────────────────
{
  let iguais = 0; const erros = [];
  lista.forEach((t) => {
    const r = resumoDe(t);
    const A = { c: W._cardCompetidores(t), e: W._cardEspera(t), p: W._cardProgresso(t), d: W._cardTemChave(t) };
    const B = { c: W._cardCompetidores(r), e: W._cardEspera(r), p: W._cardProgresso(r), d: W._cardTemChave(r) };
    const bate = A.c.people === B.c.people && A.c.teams === B.c.teams && A.e === B.e
      && A.p.total === B.p.total && A.p.completed === B.p.completed && A.p.pct === B.p.pct && A.d === B.d;
    if (bate) iguais++;
    else if (erros.length < 3) erros.push((t.name || '?').slice(0, 20));
  });
  ok(lista.length > 10, 'a base tem torneios de verdade (' + lista.length + ')');
  ok(iguais === lista.length,
     '⛔ contagens, progresso e "já sorteou" batem em ' + iguais + '/' + lista.length +
     (erros.length ? ' — divergem: ' + erros.join(' · ') : ''));
}

// ── ② ⭐ O BOTÃO: "estou inscrito?" e "estou na espera?" ────────────────────
{
  let conferidos = 0, iguais = 0; const erros = [];
  lista.forEach((t) => {
    const r = resumoDe(t);
    const uids = new Set();
    (Array.isArray(t.participants) ? t.participants : []).forEach((p) => { if (p && p.uid) uids.add(p.uid); });
    (Array.isArray(t.standbyParticipants) ? t.standbyParticipants : []).forEach((p) => { if (p && p.uid) uids.add(p.uid); });
    (Array.isArray(t.waitlist) ? t.waitlist : []).forEach((p) => { if (p && p.uid) uids.add(p.uid); });
    uids.add('uid-que-nao-existe');
    uids.forEach((uid) => {
      const cu = { uid: uid };
      conferidos++;
      const insA = W._cardSouInscrito(t, cu), insB = W._cardSouInscrito(r, cu);
      const espA = W._cardSouEspera(t, cu), espB = W._cardSouEspera(r, cu);
      if (insA === insB && espA === espB) iguais++;
      else if (erros.length < 3) erros.push((t.name || '?').slice(0, 16) + '/' + uid.slice(0, 8) +
        ' inscrito ' + insA + '≠' + insB + ' espera ' + espA + '≠' + espB);
    });
  });
  ok(conferidos > 100, 'conferiu ' + conferidos + ' combinações de pessoa × torneio');
  ok(iguais === conferidos,
     '⭐ o BOTÃO é o mesmo nos dois caminhos (' + iguais + '/' + conferidos + ')' +
     (erros.length ? '\n      ' + erros.join('\n      ') : ''));
}

// ── ③ o resumo é MESMO leve ─────────────────────────────────────────────────
{
  let cheio = 0, leve = 0, maior = 0;
  lista.forEach((t) => {
    cheio += JSON.stringify(t).length;
    const n = JSON.stringify(resumoDe(t)).length;
    leve += n; if (n > maior) maior = n;
  });
  ok(leve < cheio * 0.35,
     'a base inteira fica ' + (100 - leve / cheio * 100).toFixed(0) + '% menor (' +
     Math.round(cheio / 1024) + ' KB → ' + Math.round(leve / 1024) + ' KB)');
  ok(maior / 1024 < 20, 'e o MAIOR resumo cabe em ' + (maior / 1024).toFixed(1) + ' KB');
}

// ── ④ ⛔ o resumo se DECLARA, e quem abre troca pelo completo ───────────────
{
  const r = resumoDe(lista[0]);
  ok(r._resumo === true, '⛔ o resumo vem marcado com `_resumo: true`');
  const store = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
  const i = store.indexOf('window._ensureTournamentLoaded = function');
  const corpo = store.slice(i, i + 1800);
  ok(/local\._resumo === true.*local = null/s.test(corpo),
     '⭐ e um resumo conta como "não carregado" — abrir vai buscar o documento completo');
  ok(/arr\[i\] = t;/.test(corpo),
     '⛔ o completo SUBSTITUI o resumo na lista (empurrar pro fim deixaria os dois, e a busca devolve o PRIMEIRO)');
  const router = fs.readFileSync(path.join(__dirname, '..', 'js', 'router.js'), 'utf8');
  ok(/_ensureTournamentLoaded\(cleanParam[\s\S]{0,120}_pintaTorneio\(\)/.test(router),
     '⛔ e a rota do torneio garante o completo ANTES de pintar');
}

// ── ⑤ ⛔ a vitrine tem REDE: resumo vazio cai no caminho antigo ─────────────
// Vitrine vazia por causa de migração seria pior que vitrine pesada.
{
  const db = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8');
  const i = db.indexOf('async loadAllPublicTournaments');
  const corpo = db.slice(i, i + 5200);   // a função tem um bloco grande de comentário antes da consulta
  ok(/tournaments_summary/.test(corpo), '⭐ a vitrine lê `tournaments_summary`');
  ok(/if \(!_viaResumo\)/.test(corpo),
     '⛔ e cai no caminho ANTIGO quando o resumo não responde');
  const iR = corpo.indexOf('tournaments_summary');
  const iA = corpo.indexOf("collection('tournaments')");
  ok(iR > 0 && iA > iR, 'nessa ordem: resumo primeiro, documento completo só como rede');
}

// ── ⑥ enquete vai INTEIRA (o cartão desenha os detalhes dela) ──────────────
{
  const t = { id: 'x', polls: [{ q: 'Quando?', opts: ['sáb', 'dom'], votes: { a: 0 } }] };
  const r = M.buildSummary(t, 'x', helpers);
  ok(JSON.stringify(r.polls) === JSON.stringify(t.polls),
     '⛔ a enquete é copiada inteira — resumir faria ela sumir do cartão');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);

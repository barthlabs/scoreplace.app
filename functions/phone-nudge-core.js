'use strict';
/*
 * phone-nudge-core.js — COBRANÇA DIÁRIA DE CELULAR NO PERFIL (puro, sem I/O).
 *
 * Pedido do dono (19/ago/2026), depois do envio manual do dia 18: _"vamos fazer
 * essa verificação diariamente e mandar esse e-mail novamente a quem ainda não
 * atendeu ao chamado. aos que colocaram, não mande novamente. o e-mail
 * consolidando as informações pode atualizar dos que receberam, quais atenderam
 * em cada leva."_
 *
 * ⭐ A LIÇÃO QUE DEFINE ESTE DESENHO ([[project_cobranca_de_celular_no_perfil]]):
 * quando ele perguntou "quantos estavam sem celular antes? quantos são agora?", a
 * resposta honesta foi NÃO DÁ PRA SABER — o envio manual não guardou quem recebeu,
 * só existia a foto do momento. Por isso cada rodada PERSISTE a leva (quem recebeu
 * + a foto do elenco naquele instante). Sem isso, "quantos atenderam" é chute com
 * cara de dado. Ver [[feedback_proof_lives_in_the_data_not_in_a_stamp]].
 *
 * PURO de propósito (nada de admin/firestore aqui): quem lê o Firestore é
 * phone-nudge-run.js, e a REGRA — quem é cobrado, quem nunca é, e como a conversão
 * é contada — mora aqui, exercitada pelo teste com o código REAL
 * ([[feedback_green_tests_still_broken]]).
 *
 * A REGRA, na ordem do que dói errar:
 *   1. quem TEM celular NUNCA recebe — nem no primeiro envio;
 *   2. e-mail de placeholder (@phone.scoreplace.app, conta só-celular) NÃO é
 *      endereço: quem só tem isso não é alcançável por e-mail;
 *   3. `notifyEmail === false` é opt-out e vale mais que a campanha;
 *   4. LÁPIDE não é pessoa: uid com `mergedInto` é seguido até a conta VIVA e o
 *      celular avaliado É o dela ([[divida-de-uid-morto-no-dado]]). Cobrar a lápide
 *      seria e-mail pra quem já atendeu na outra conta;
 *   5. a mesma pessoa em dois slots (dupla p1/p2, Rei/Rainha) é UMA cobrança.
 *
 * ⛔ O canal é E-MAIL. WhatsApp/Meta é proibido automatizar
 * ([[feedback_meta_platform_no_automation]]) — o app só oferece link wa.me.
 */

var REPORT_TO = 'contato@barthlabs.com';
var REPLY_TO = 'scoreplace.app@gmail.com';
var PLACEHOLDER_EMAIL = /@phone\.scoreplace\.app$/i;
var PERFIL_URL = 'https://scoreplace.app/#profile';

/* ── datas ──────────────────────────────────────────────────────────────────
 * A leva é identificada pelo DIA EM BRT, não em UTC: a CF roda de manhã em São
 * Paulo e o log do servidor é UTC. Misturar os dois já custou conclusão errada
 * neste projeto — o fuso é parte do dado. */
function brtDateStr(ms) {
  var d = new Date(ms == null ? Date.now() : ms);
  if (isNaN(d.getTime())) return '';
  // en-CA devolve YYYY-MM-DD já no fuso pedido.
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
}

function fmtBR(ms) {
  var d = new Date(ms == null ? Date.now() : ms);
  if (isNaN(d.getTime())) return '(data desconhecida)';
  try {
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }) + ' (BRT)';
  } catch (e) { return d.toISOString() + ' (UTC)'; }
}

// dd/mm a partir de 'YYYY-MM-DD' — leva string, não Date: o waveId JÁ é BRT e
// passar por Date reintroduziria o fuso que ele resolveu.
function diaMes(waveId) {
  var m = String(waveId || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? m[3] + '/' + m[2] : String(waveId || '');
}

/* Um doc por DIA e por TORNEIO. O id determinístico é o que faz a rotina ser
 * idempotente: rodar de novo no mesmo dia não cria uma segunda leva nem um
 * segundo e-mail pra mesma pessoa. */
function waveDocId(waveId, tournamentId) {
  return String(waveId) + '__' + String(tournamentId);
}

/* ── elenco ─────────────────────────────────────────────────────────────────
 * Espelha participantUids (functions/enroll-core.js): solo, dupla (p1/p2) e time
 * (participants[]). Standby entra: quem está na fila também joga o torneio e
 * também precisa ser achado pelo grupo. */
function rosterUids(t) {
  var seen = {}, out = [];
  function add(u) { if (u && typeof u === 'string' && !seen[u]) { seen[u] = true; out.push(u); } }
  function fromP(p) {
    if (!p || typeof p !== 'object') return;
    add(p.uid); add(p.p1Uid); add(p.p2Uid);
    if (Array.isArray(p.participants)) p.participants.forEach(function (s) { if (s) add(s.uid); });
  }
  (t && Array.isArray(t.participants) ? t.participants : []).forEach(fromP);
  (t && Array.isArray(t.standbyParticipants) ? t.standbyParticipants : []).forEach(fromP);
  return out;
}

/* ── leitura de perfil ──────────────────────────────────────────────────────
 * 8 dígitos é o mesmo piso do envio manual do dia 18 — mantido de propósito pra
 * a leva 2 contar a MESMA coisa que a leva 1. */
function hasPhone(profile) {
  return String((profile && profile.phone) || '').replace(/\D/g, '').length >= 8;
}

function emailOf(profile) {
  var e = String((profile && profile.email) || '').trim();
  if (!e || PLACEHOLDER_EMAIL.test(e)) return '';
  return e;
}

/* Segue a corrente de fusão até a conta viva. Limite de saltos porque corrente
 * quebrada/ciclo existe no dado real e não pode virar laço infinito. */
function resolveLive(uid, profiles) {
  var cur = uid, hops = 0, seen = {};
  while (cur && hops < 6) {
    var p = profiles && (profiles[cur] || (profiles.get && profiles.get(cur)));
    if (!p || !p.mergedInto || seen[cur]) return { uid: cur, profile: p || null, hops: hops };
    seen[cur] = true;
    cur = String(p.mergedInto);
    hops++;
  }
  var last = profiles && (profiles[cur] || (profiles.get && profiles.get(cur)));
  return { uid: cur, profile: last || null, hops: hops };
}

/* ── a classificação ────────────────────────────────────────────────────────
 * Devolve a foto do elenco + a lista de quem é cobrado HOJE. `skipped` não é
 * detalhe: o relatório do envio manual AFIRMOU "ninguém ficou de fora" com a
 * frase escrita à mão no HTML — aqui os excluídos são contados e mostrados. */
function classifyRoster(uids, profiles) {
  var seenLive = {};
  var targets = [], withPhone = [], noEmail = [], optOut = [], merged = [], missing = [];
  (uids || []).forEach(function (uid) {
    var r = resolveLive(uid, profiles);
    var p = r.profile;
    if (r.uid !== uid) merged.push({ uid: uid, into: r.uid });
    if (!p || p.deleted === true) { missing.push({ uid: r.uid }); return; }
    if (seenLive[r.uid]) return;          // mesma pessoa em dois slots = uma cobrança
    seenLive[r.uid] = true;
    var name = String(p.displayName || '').trim();
    if (hasPhone(p)) { withPhone.push({ uid: r.uid, name: name }); return; }
    var email = emailOf(p);
    if (!email) { noEmail.push({ uid: r.uid, name: name }); return; }
    if (p.notifyEmail === false) { optOut.push({ uid: r.uid, name: name, email: email }); return; }
    targets.push({ uid: r.uid, name: name, email: email, first: (name.split(/\s+/)[0] || name) });
  });
  var roster = Object.keys(seenLive).length;
  return {
    roster: roster,
    withPhone: withPhone.length,
    withoutPhone: roster - withPhone.length,
    targets: targets,
    skipped: { noEmail: noEmail, optOut: optOut, merged: merged, missing: missing }
  };
}

/* ── conversão por leva ─────────────────────────────────────────────────────
 * O que o dono pediu ver: de quem recebeu EM CADA LEVA, quantos já colocaram.
 * `hasPhoneNow` é um mapa uid→bool montado do estado de HOJE. Leva de ENSAIO
 * entra na tabela marcada — ninguém recebeu nada nela, e somar as duas como se
 * fossem a mesma coisa inventaria uma cobrança que não houve. */
function waveStats(waves, hasPhoneNow) {
  var ordered = (waves || []).slice().sort(function (a, b) {
    return String(a.waveId || '').localeCompare(String(b.waveId || ''));
  });
  var prev = null;
  return ordered.map(function (w) {
    var uids = Array.isArray(w.recipientUids) ? w.recipientUids : [];
    var answered = uids.filter(function (u) {
      return !!(hasPhoneNow && (hasPhoneNow[u] || (hasPhoneNow.get && hasPhoneNow.get(u))));
    });
    var novos = (prev && typeof prev.withoutPhone === 'number' && typeof w.withoutPhone === 'number')
      ? prev.withoutPhone - w.withoutPhone : null;
    prev = w;
    return {
      waveId: w.waveId, dryRun: w.dryRun === true, sent: uids.length,
      answered: answered.length, pending: uids.length - answered.length,
      answeredUids: answered,
      roster: w.roster, withPhone: w.withPhone, withoutPhone: w.withoutPhone,
      novosDesdeAnterior: novos
    };
  });
}

/* ── HTML ───────────────────────────────────────────────────────────────── */
function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ── 1) O E-MAIL DA PESSOA ──────────────────────────────────────────────────
 * ⚠️ TEXTO DO DONO, do envio manual do dia 18 — copiado, não reescrito. Ele já
 * foi lido por 49 pessoas; mudar a voz agora faria a leva 2 parecer outra
 * campanha. A ÚNICA linha nova é a que reconhece o reenvio ("se já cadastrou,
 * pode ignorar"), que a cobrança diária exige: sem ela, quem cadastrou hoje de
 * manhã recebe amanhã um pedido que já atendeu e acha que o app não viu. */
function buildNudgeEmail(nome) {
  var n = String(nome || '').trim();
  var subject = 'Confra BT Alta da Clínica 2026 — coloca seu Whats no perfil?';
  var html = '<div style="font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;font-size:15px;line-height:1.6;color:#1c1c1e;max-width:600px;">'
    + '<p>Olá ' + esc(n) + '! Aqui é Rodrigo Barth. Somos do torneio <b>"Confra BT Alta da Clínica 2026"</b> no <a href="https://scoreplace.app" style="color:#0a84ff;">scoreplace.app</a>.</p>'
    + '<p>Se puder colocar seu Whats no seu perfil do app facilitará o contato do seu grupo para combinar seus jogos.</p>'
    + '<p><a href="' + PERFIL_URL + '" style="display:inline-block;background:#0a84ff;color:#fff;text-decoration:none;padding:10px 18px;border-radius:10px;font-weight:600;">Abrir meu perfil no scoreplace</a></p>'
    + '<p>Se precisar clica no <b>fale com o organizador</b> que abre meu Whats e te ajudo.</p>'
    + '<p style="color:#6b7280;font-size:13px;">Se você já cadastrou, obrigado — pode ignorar este aviso.</p>'
    + '<p>Rodrigo Barth</p></div>';
  var text = 'Olá ' + n + '! Aqui é Rodrigo Barth, do torneio "Confra BT Alta da Clínica 2026" no scoreplace.app.\n\n'
    + 'Se puder colocar seu Whats no seu perfil do app facilitará o contato do seu grupo para combinar seus jogos.\n\n'
    + 'Abrir meu perfil: ' + PERFIL_URL + '\n\n'
    + 'Se precisar clica no "fale com o organizador" que abre meu Whats e te ajudo.\n'
    + 'Se você já cadastrou, obrigado — pode ignorar este aviso.\n\nRodrigo Barth';
  return { subject: subject, html: html, text: text };
}

/* ── 2) O CONSOLIDADO DO DONO ───────────────────────────────────────────────
 * A tabela POR LEVA é o pedido literal: quem recebeu, quantos atenderam. E a
 * linha dos excluídos existe porque o relatório manual afirmou o contrário sem
 * medir. */
var WRAP = 'font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;'
  + 'max-width:640px;margin:0 auto;padding:20px;color:#1f2937;line-height:1.55;font-size:14px;';
var TH = 'text-align:left;padding:6px 8px;border-bottom:2px solid #d1d5db;font-size:13px;color:#374151;';
var TD = 'padding:6px 8px;border-bottom:1px solid #e5e7eb;';

function buildReportEmail(info) {
  info = info || {};
  var stats = info.stats || [];
  var hoje = info.today || {};
  var dry = info.dryRun === true;
  var tName = String(info.tournamentName || '');
  var sk = hoje.skipped || {};
  var nSkip = (sk.noEmail || []).length + (sk.optOut || []).length;

  var subject = (dry ? '[ENSAIO] ' : '')
    + 'Celular no perfil — leva ' + diaMes(info.waveId) + ': '
    + (hoje.targets || []).length + ' cobrados, ' + (hoje.withPhone || 0) + '/' + (hoje.roster || 0) + ' já têm';

  var linhas = stats.map(function (s) {
    return '<tr>'
      + '<td style="' + TD + '">' + esc(diaMes(s.waveId)) + (s.dryRun ? ' <span style="color:#92400e;">(ensaio)</span>' : '') + '</td>'
      + '<td style="' + TD + 'text-align:right;">' + s.sent + '</td>'
      + '<td style="' + TD + 'text-align:right;color:#065f46;font-weight:600;">' + s.answered + '</td>'
      + '<td style="' + TD + 'text-align:right;">' + s.pending + '</td>'
      + '<td style="' + TD + 'text-align:right;color:#6b7280;">' + (s.withPhone == null ? '—' : s.withPhone + '/' + s.roster) + '</td>'
      + '</tr>';
  }).join('');

  var lista = (hoje.targets || []).map(function (p, i) {
    return (i + 1) + '. ' + esc(p.name || '(sem nome)') + ' &lt;' + esc(p.email) + '&gt;';
  }).join('<br>');

  var html = '<div style="' + WRAP + '">'
    + '<div style="font-size:18px;font-weight:700;margin:0 0 4px;color:#111827;">Celular no perfil — ' + esc(tName) + '</div>'
    + '<div style="color:#6b7280;margin:0 0 14px;">Leva de ' + esc(diaMes(info.waveId)) + ' · ' + esc(fmtBR(info.nowMs)) + '</div>'
    + (dry ? '<div style="background:#fef3c7;border-radius:8px;padding:10px 12px;margin:0 0 14px;color:#92400e;">'
        + '<b>ENSAIO — nenhum e-mail foi enviado aos participantes.</b> A lista abaixo é quem RECEBERIA. '
        + 'Pra ligar de verdade: <code>appConfig/phoneNudge.enabled = true</code>.</div>' : '')
    + '<div style="background:#f3f4f6;border-radius:10px;padding:12px 14px;margin:0 0 16px;">'
      + '<div>Elenco: <b>' + (hoje.roster || 0) + '</b></div>'
      + '<div>Já com celular: <b style="color:#065f46;">' + (hoje.withPhone || 0) + '</b></div>'
      + '<div>Ainda sem celular: <b>' + (hoje.withoutPhone || 0) + '</b></div>'
      + '<div>Cobrados nesta leva: <b>' + (hoje.targets || []).length + '</b>'
        + (nSkip ? ' <span style="color:#92400e;">(' + nSkip + ' sem celular NÃO foram cobrados — ver abaixo)</span>' : '')
      + '</div>'
    + '</div>'
    + '<p style="font-weight:600;margin:0 0 6px;">Cada leva, e quem atendeu depois dela</p>'
    + '<table style="border-collapse:collapse;width:100%;margin:0 0 16px;">'
      + '<tr><th style="' + TH + '">Leva</th><th style="' + TH + 'text-align:right;">Cobrados</th>'
      + '<th style="' + TH + 'text-align:right;">Atenderam</th><th style="' + TH + 'text-align:right;">Faltam</th>'
      + '<th style="' + TH + 'text-align:right;">Elenco c/ celular</th></tr>'
      + (linhas || '<tr><td style="' + TD + '" colspan="5">(primeira leva)</td></tr>')
    + '</table>'
    + '<p style="font-weight:600;margin:0 0 6px;">' + (dry ? 'Receberiam agora' : 'Cobrados nesta leva') + '</p>'
    + '<p style="margin:0 0 16px;">' + (lista || '<i>ninguém — todo mundo do elenco já tem celular no perfil</i>') + '</p>'
    + (nSkip
        ? '<p style="font-weight:600;margin:0 0 6px;">Sem celular e NÃO cobrados</p><ul style="margin:0 0 16px;padding-left:20px;">'
          + (sk.noEmail || []).map(function (p) { return '<li>' + esc(p.name || p.uid) + ' — sem e-mail alcançável (conta só-celular)</li>'; }).join('')
          + (sk.optOut || []).map(function (p) { return '<li>' + esc(p.name || p.uid) + ' — desligou e-mail no perfil</li>'; }).join('')
          + '</ul>'
        : '')
    + '<div style="margin-top:18px;padding-top:12px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;">'
      + 'Rotina diária <code>nudgeMissingPhones</code> · quem já tem celular nunca é cobrado · '
      + 'a leva fica gravada em <code>phoneNudgeWaves/' + esc(waveDocId(info.waveId, info.tournamentId || '')) + '</code>.'
    + '</div></div>';

  return { subject: subject, html: html };
}

module.exports = {
  REPORT_TO: REPORT_TO, REPLY_TO: REPLY_TO, PERFIL_URL: PERFIL_URL,
  brtDateStr: brtDateStr, fmtBR: fmtBR, diaMes: diaMes, waveDocId: waveDocId,
  rosterUids: rosterUids, hasPhone: hasPhone, emailOf: emailOf, resolveLive: resolveLive,
  classifyRoster: classifyRoster, waveStats: waveStats,
  buildNudgeEmail: buildNudgeEmail, buildReportEmail: buildReportEmail, esc: esc,
};

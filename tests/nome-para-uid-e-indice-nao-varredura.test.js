/* `_memberUidByName` É ÍNDICE, NÃO VARREDURA — e responde EXATAMENTE o mesmo.
 *
 * MEDIDO (25/ago/2026) no render REAL da tela inicial com os 28 torneios da base:
 *   · `_memberUidByName` era chamada 58 vezes e disparava ~8.000 resoluções de nome
 *     (8.959 no render inteiro) — 54% de toda a CPU do desenho;
 *   · `renderDashboard`: 13,4 ms → 6,5 ms depois do índice (desktop).
 *
 * POR QUE ERA CARO: a 2ª passada resolve o nome VIVO de CADA entrada a cada chamada,
 * e ela roda SEMPRE em torneio real — `_stripUidEntryNames` apaga o nome de toda
 * entrada cujo uid resolve (Confra: 111 entradas, 111 com uid, ZERO com nome). A
 * passada barata nunca casa; a cara varre tudo, toda vez. Mesma forma do O(n²) que
 * fazia a chave levar 925ms no iPhone.
 *
 * ⛔ O QUE ESTE TESTE TRAVA: um índice que seja RÁPIDO E ERRADO. Ele guarda a
 * implementação ANTIGA aqui dentro como REFERÊNCIA e compara as duas, nome por nome,
 * em todos os torneios da base real. Se a semântica mudar, acusa.
 */
const HARNESS = require('./render-harness');
const W = HARNESS.window;
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── nome→uid: índice com a MESMA resposta da varredura ────');

// ── A IMPLEMENTAÇÃO ANTIGA, palavra por palavra, como referência ─────────────
function _antiga(t, name) {
  if (!t || !name) return '';
  var target = String(name).trim().toLowerCase();
  if (!target) return '';
  var pools = [];
  if (Array.isArray(t.participants)) pools.push(t.participants);
  if (Array.isArray(t.standbyParticipants)) pools.push(t.standbyParticipants);
  if (Array.isArray(t.waitlist)) pools.push(t.waitlist);
  for (var pi = 0; pi < pools.length; pi++) {
    var arr = pools[pi];
    for (var i = 0; i < arr.length; i++) {
      var p = arr[i];
      if (!p || typeof p !== 'object') continue;
      if ((p.displayName || p.name || '').trim().toLowerCase() === target && p.uid) return p.uid;
      if ((p.p1Name || '').trim().toLowerCase() === target && p.p1Uid) return p.p1Uid;
      if ((p.p2Name || '').trim().toLowerCase() === target && p.p2Uid) return p.p2Uid;
      if (Array.isArray(p.participants)) {
        for (var s = 0; s < p.participants.length; s++) {
          var sub = p.participants[s];
          if (sub && (sub.displayName || sub.name || '').trim().toLowerCase() === target && sub.uid) return sub.uid;
        }
      }
    }
  }
  var _live = (typeof W._nameForUid === 'function') ? W._nameForUid : null;
  if (_live) {
    for (var pi2 = 0; pi2 < pools.length; pi2++) {
      var arr2 = pools[pi2];
      for (var j = 0; j < arr2.length; j++) {
        var q = arr2[j];
        if (!q || typeof q !== 'object') continue;
        if (q.uid && String(_live(q.uid) || '').trim().toLowerCase() === target) return q.uid;
        if (q.p1Uid && String(_live(q.p1Uid) || '').trim().toLowerCase() === target) return q.p1Uid;
        if (q.p2Uid && String(_live(q.p2Uid) || '').trim().toLowerCase() === target) return q.p2Uid;
        if (Array.isArray(q.participants)) {
          for (var s2 = 0; s2 < q.participants.length; s2++) {
            var sub2 = q.participants[s2];
            if (sub2 && sub2.uid && String(_live(sub2.uid) || '').trim().toLowerCase() === target) return sub2.uid;
          }
        }
      }
    }
  }
  return '';
}

// ── ① equivalência na BASE REAL, nome por nome ───────────────────────────────
{
  const arr = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'prod-tournaments.json'), 'utf8'));
  const lista = Array.isArray(arr) ? arr : (arr.tournaments || []);
  let comparados = 0, iguais = 0; const erros = [];

  // ⚠️ O harness não tem cache de perfis, então `_nameForUid` devolve vazio quase
  // sempre — e o caminho CARO (a 2ª passada, por nome VIVO) ficaria sem cobertura.
  // Aqui ele é substituído por um resolvedor determinístico: todo uid ganha um nome
  // vivo, e alguns ganham DE PROPÓSITO o mesmo nome de outra entrada (pra provar que
  // a regra de precedência e a de "primeiro que chega vence" seguem valendo).
  const _nfuOriginal = W._nameForUid;
  W._nameForUid = function (uid) {
    if (!uid) return '';
    var s = String(uid);
    if (s.charCodeAt(s.length - 1) % 7 === 0) return 'Nome Repetido';  // colisões de propósito
    return 'Vivo ' + s;
  };
  W._bumpProfileEpoch();

  lista.forEach((t) => {
    // Todos os nomes que existem no torneio, gravados E vivos, mais alguns que NÃO
    // existem (o caso "não achou" também tem que bater).
    const nomes = new Set(['', '   ', 'Fulano Que Nao Existe', 'BYE', 'TBD']);
    [t.participants, t.standbyParticipants, t.waitlist].forEach((pool) => {
      (Array.isArray(pool) ? pool : []).forEach((p) => {
        if (!p || typeof p !== 'object') return;
        [p.displayName, p.name, p.p1Name, p.p2Name].forEach((n) => { if (n) nomes.add(n); });
        [p.uid, p.p1Uid, p.p2Uid].forEach((u) => {
          if (u && typeof W._nameForUid === 'function') { const n = W._nameForUid(u); if (n) nomes.add(n); }
        });
        (Array.isArray(p.participants) ? p.participants : []).forEach((s) => {
          if (!s) return;
          if (s.displayName) nomes.add(s.displayName);
          if (s.name) nomes.add(s.name);
          if (s.uid && typeof W._nameForUid === 'function') { const n = W._nameForUid(s.uid); if (n) nomes.add(n); }
        });
      });
    });
    nomes.forEach((nome) => {
      comparados++;
      const a = _antiga(t, nome), b = W._memberUidByName(t, nome);
      if (a === b) iguais++;
      else if (erros.length < 5) erros.push((t.name || '?').slice(0, 18) + ' · "' + String(nome).slice(0, 22) + '" → antiga=' + (a || '∅') + ' nova=' + (b || '∅'));
    });
  });

  W._nameForUid = _nfuOriginal;
  W._bumpProfileEpoch();

  // 400 é o que a base real dá hoje (429). Não inflar com nomes sintéticos: o valor
  // do teste está em comparar as duas implementações no DADO DE VERDADE.
  ok(lista.length > 10 && comparados > 400,
     'comparou ' + comparados + ' buscas de nome em ' + lista.length + ' torneios reais ' +
     '(gravados, vivos, colisões e nomes inexistentes)');
  ok(iguais === comparados,
     '⛔ o índice devolve EXATAMENTE o que a varredura devolvia (' + iguais + '/' + comparados + ')' +
     (erros.length ? '\n      ' + erros.join('\n      ') : ''));
}

// ── ② a PRECEDÊNCIA continua: nome GRAVADO ganha do nome VIVO ────────────────
{
  const t = {
    participants: [
      { uid: 'u1', displayName: 'Nome Gravado' },
      { uid: 'u2' }
    ]
  };
  const antes = W._nameForUid;
  W._nameForUid = (uid) => (uid === 'u2' ? 'Nome Gravado' : (uid === 'u1' ? 'Nome Vivo Do U1' : ''));
  try {
    W._bumpProfileEpoch();
    ok(W._memberUidByName(t, 'Nome Gravado') === 'u1',
       '⛔ com o mesmo nome nos dois lados, o GRAVADO vence (u1), como no laço original');
    ok(W._memberUidByName(t, 'Nome Vivo Do U1') === 'u1',
       'e o nome VIVO ainda resolve quando o gravado não casa');
  } finally { W._nameForUid = antes; W._bumpProfileEpoch(); }
}

// ── ③ jogador informal (sem uid) devolve '' ──────────────────────────────────
{
  const t = { participants: [{ displayName: 'Sem Conta' }, { uid: 'u9', displayName: 'Com Conta' }] };
  W._bumpProfileEpoch();
  ok(W._memberUidByName(t, 'Sem Conta') === '', 'entrada sem uid devolve vazio (jogador informal)');
  ok(W._memberUidByName(t, 'Com Conta') === 'u9', 'e a entrada com uid resolve');
  ok(W._memberUidByName(t, null) === '' && W._memberUidByName(null, 'x') === '',
     'entradas nulas devolvem vazio, não explodem');
}

// ── ④ ⭐ O CACHE NÃO PODE FICAR VELHO ────────────────────────────────────────
// Perfil resolvido depois do 1º render TEM que aparecer — é a época que garante.
{
  const t = { participants: [{ uid: 'u1' }] };
  const antes = W._nameForUid;
  try {
    W._nameForUid = () => '';
    W._bumpProfileEpoch();
    ok(W._memberUidByName(t, 'Chegou Depois') === '', 'antes do perfil resolver, não acha (correto)');
    W._nameForUid = (uid) => (uid === 'u1' ? 'Chegou Depois' : '');
    W._bumpProfileEpoch();   // é isto que o store faz ao resolver um perfil
    ok(W._memberUidByName(t, 'Chegou Depois') === 'u1',
       '⭐ depois de _bumpProfileEpoch o índice é REMONTADO — nome novo aparece');
  } finally { W._nameForUid = antes; W._bumpProfileEpoch(); }
}

// ── ⑤ inscrito NOVO invalida o índice (a lista mudou de tamanho) ────────────
{
  const t = { participants: [{ uid: 'u1', displayName: 'Um' }] };
  W._bumpProfileEpoch();
  ok(W._memberUidByName(t, 'Dois') === '', 'antes de entrar, não acha');
  t.participants.push({ uid: 'u2', displayName: 'Dois' });
  ok(W._memberUidByName(t, 'Dois') === 'u2',
     '⛔ inscrito novo aparece sem esperar a época (o índice confere o tamanho)');
}

// ── ⑥ ⚡ a PROPRIEDADE de desempenho: uma varredura, não uma por chamada ─────
// Sem isto, alguém "simplifica" o índice de volta pra varredura e o teste ①
// continuaria verde — rápido e errado é o que se trava aqui.
{
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'confra-pos-sorteio.json'), 'utf8'));
  const t = fx.tournament || fx;
  const entradas = (Array.isArray(t.participants) ? t.participants.length : 0);
  const orig = W._nameForUid;
  let chamadas = 0;
  W._nameForUid = function () { chamadas++; return orig ? orig.apply(this, arguments) : ''; };
  try {
    W._bumpProfileEpoch();
    for (let i = 0; i < 50; i++) W._memberUidByName(t, 'Nome Que Nao Existe ' + i);
    ok(entradas > 50, 'o Confra tem entradas de verdade (' + entradas + ')');
    ok(chamadas <= entradas * 4,
       '⚡ 50 buscas custaram ' + chamadas + ' resoluções de nome (varreria ~' +
       (entradas * 50) + ' antes) — o índice é montado UMA vez');
  } finally { W._nameForUid = orig; W._bumpProfileEpoch(); }
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);

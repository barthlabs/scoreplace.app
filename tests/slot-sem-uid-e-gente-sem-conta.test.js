/* slot-sem-uid-e-gente-sem-conta — um slot de jogo só pode estar sem uid se a pessoa
 * ali NÃO TEM CONTA.
 *
 * 🔴 O SINTOMA (dono, 23/ago/2026): _"o Rodrigo Unger diminuiu o nome e aparece o nome
 * completo"_. Quem renomeia o perfil continua aparecendo com o nome antigo no card da chave.
 *
 * MEDIDO nos 28 torneios REAIS (tests/fixtures/prod-tournaments.json): 267 slots de gente,
 * 39 (14,6%) com MENOS uid do que nomes. `_slotUidsPositional` devolve array curto/vazio, o
 * card cai no rótulo gravado em `m.p1`/`m.p2`, e esse rótulo envelhece pra sempre.
 *
 * ⚠️ MAS A CAUSA ÓBVIA ESTÁ ERRADA, e é por isso que este teste existe. A leitura intuitiva
 * — "doc legado, criado antes de o sorteio gravar uid no slot" — não sobrevive à medição:
 * casando os 86 nomes desses 39 slots contra os inscritos do PRÓPRIO torneio, 69 têm inscrito
 * com uid VAZIO gravado explicitamente (`uid: ""`, `p1Uid: ""`), 17 não casam com inscrito
 * nenhum e não têm uid em lugar algum, 0 são ambíguos e **0 são recuperáveis**. São jogadores
 * FICTÍCIOS: gente sem conta, digitada pelo organizador. Pelo cânone, o nome digitado É a
 * identidade legítima deles — não existe perfil pra renomear, então não há nome vivo a mostrar.
 * Um backfill nome→uid escreveria ZERO slots. Ver [[project_uid_identity_canon_locked]].
 *
 * ENTÃO O QUE ESTE TESTE GUARDA não é a contagem (ela sobe legitimamente a cada torneio novo
 * com gente sem conta) — é o INVARIANTE:
 *
 *    slot sem uid  ⇒  TODO nome nele é de alguém sem conta
 *
 * A violação é o bug de verdade: alguém COM conta num slot sem uid = nome congelado que
 * nunca mais atualiza. Hoje isso é 0 e tem que continuar 0.
 *
 * FALHA NO CÓDIGO ANTIGO: nada cobrava isso. Um sorteio que parasse de gravar uid no slot,
 * ou uma fusão que largasse o slot pra trás, passaria verde — o dado só apareceria como
 * "nome velho na tela" meses depois, sem ninguém ligar uma coisa à outra.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(cond, msg) { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } }
console.log('──── slot sem uid é gente sem conta ────');

// ── Carrega o MOTOR DE VERDADE, não uma réplica ──────────────────────────────
// bracket-logic.js é escrito como `window.X = function` + `function X(){}`, e resolve
// referências cruzadas por identificador nu — daí `sandbox.window = sandbox`.
const sandbox = { location: { search: '' }, setTimeout: function () {}, console: console };
sandbox.window = sandbox;
sandbox._t = function (k, v) { return (v && v.name) ? v.name : k; };
sandbox._warn = sandbox._log = sandbox._error = function () {};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js/views/bracket-logic.js'), 'utf8'), sandbox);
const slotUids = sandbox.window._slotUidsPositional;
ok(typeof slotUids === 'function', 'window._slotUidsPositional existe');

// ── ⚠️ SENTINELA NÃO É GENTE ─────────────────────────────────────────────────
// Foi a armadilha que quase inverteu a medição: contando FOLGA/W.O. como pessoa, a conta
// infla em 10 slots e o Confra — que tem 100% de cobertura de uid — aparece com 8 furos.
const SENTINELA = new Set(['', 'TBD', 'BYE', 'A definir', 'BYE (Avança Direto)', 'FOLGA', 'W.O.', 'WO', 'Aguardando']);
function nomesDoSlot(m, side) {
  const raw = side === 'p1' ? m.p1 : m.p2;
  return String(raw == null ? '' : raw).split(' / ').map(s => s.trim())
    .filter(s => s && !SENTINELA.has(s));
}
ok(nomesDoSlot({ p1: 'FOLGA' }, 'p1').length === 0, 'FOLGA não conta como pessoa');
ok(nomesDoSlot({ p1: 'W.O.' }, 'p1').length === 0, 'W.O. não conta como pessoa');
ok(nomesDoSlot({ p1: 'Ana / Bia' }, 'p1').length === 2, 'dupla conta como 2 pessoas');

function todosMatches(t) {
  const out = [];
  const push = (m, o) => { if (m && typeof m === 'object') out.push({ m, origem: o }); };
  (t.matches || []).forEach((m, i) => push(m, `matches[${i}]`));
  (t.rounds || []).forEach((r, ri) => {
    (r && r.matches || []).forEach((m, i) => push(m, `rounds[${ri}].matches[${i}]`));
    (r && r.monarchGroups || []).forEach((g, gi) =>
      (g && g.matches || []).forEach((m, i) => push(m, `rounds[${ri}].monarchGroups[${gi}].matches[${i}]`)));
  });
  (t.groups || []).forEach((g, gi) =>
    (g && g.matches || []).forEach((m, i) => push(m, `groups[${gi}].matches[${i}]`)));
  return out;
}

// Todo nome do torneio que PROVADAMENTE tem conta (uid gravado ao lado dele, em qualquer
// fonte posicional do doc). É a régua: se um desses cair num slot sem uid, é bug.
function nomesComConta(t) {
  const map = new Map();
  const par = (nome, uid) => {
    if (!uid) return;
    const n = String(nome == null ? '' : nome).trim();
    // Rótulo de dupla não é pessoa — '/' é tipografia, nunca chave.
    if (!n || SENTINELA.has(n) || n.indexOf(' / ') !== -1) return;
    if (!map.has(n)) map.set(n, uid);
  };
  const doSlot = (m) => {
    if (!m || typeof m !== 'object') return;
    par(m.p1, m.p1Uid); par(m.p2, m.p2Uid);
    (m.team1 || []).forEach((nm, i) => par(nm, (m.team1Uids || [])[i]));
    (m.team2 || []).forEach((nm, i) => par(nm, (m.team2Uids || [])[i]));
    [m.team1Obj, m.team2Obj].forEach(o => {
      if (!o || typeof o !== 'object') return;
      par(o.p1Name, o.p1Uid); par(o.p2Name, o.p2Uid);
      (o.participants || []).forEach(sp => { if (sp) par(sp.displayName || sp.name, sp.uid); });
    });
  };
  (t.participants || []).forEach(p => {
    if (!p) return;
    par(p.displayName || p.name, p.uid);
    par(p.p1Name, p.p1Uid); par(p.p2Name, p.p2Uid);
    (p.participants || []).forEach(sp => { if (sp) par(sp.displayName || sp.name, sp.uid); });
  });
  todosMatches(t).forEach(x => doSlot(x.m));
  (t.rounds || []).forEach(r => (r && r.monarchGroups || []).forEach(g => {
    if (!g) return;
    (g.players || []).forEach((nm, i) => par(nm, (g.playersUids || [])[i]));
    (g.classifCongelada || []).forEach(l => { if (l) par(l.name, l.uid); });
  }));
  (t.groups || []).forEach(g => {
    if (!g) return;
    (g.players || []).forEach((nm, i) => par(nm, (g.playersUids || [])[i]));
  });
  return map;
}

// ── A VARREDURA nos torneios REAIS ───────────────────────────────────────────
const fx = path.join(__dirname, 'fixtures', 'prod-tournaments.json');
if (!fs.existsSync(fx)) {
  console.log('  ⚠️  fixture de produção ausente — varredura pulada (node scripts/baixar-torneios.js)');
} else {
  const todos = JSON.parse(fs.readFileSync(fx, 'utf8'));
  let slots = 0, furados = 0;
  const violacoes = [];
  for (const t of todos) {
    const comConta = nomesComConta(t);
    for (const { m, origem } of todosMatches(t)) {
      for (const side of ['p1', 'p2']) {
        const nomes = nomesDoSlot(m, side);
        if (!nomes.length) continue;
        slots++;
        // COM `t`: é o que a TELA vê — _slotUidsPositional recupera uid por nome quando
        // recebe o torneio. Medir sem `t` mediria o doc, não o que a pessoa lê.
        const uids = (slotUids(m, side, t) || []).filter(Boolean);
        if (uids.length >= nomes.length) continue;
        furados++;
        for (const nome of nomes) {
          if (comConta.has(nome)) {
            violacoes.push(`${t.name} · ${origem} · ${side} · "${nome}" tem conta (${comConta.get(nome)}) mas o slot está sem uid`);
          }
        }
      }
    }
  }
  console.log(`  ℹ️  ${slots} slots de gente · ${furados} sem uid completo (${(100 * furados / slots).toFixed(1)}%)`);

  // ⭐ O INVARIANTE. Não é a contagem — é QUEM está no slot furado.
  if (violacoes.length) violacoes.slice(0, 12).forEach(v => console.log('     → ' + v));
  ok(violacoes.length === 0,
    `nenhum slot sem uid contém alguém COM conta (achadas ${violacoes.length} violações — nome congelado que nunca atualiza)`);

  // A fixture tem que continuar tendo casos furados: se virar 0, o teste está passando
  // por vacuidade (fixture trocada/esvaziada) e não guarda mais nada.
  ok(furados > 0, 'a varredura ainda encontra slots sem uid (senão o invariante passa por vacuidade)');
  ok(slots > 200, `a fixture ainda tem massa real (${slots} slots)`);
}

// ── A régua não pode ser um artefato do anonimizador ─────────────────────────
// scripts/baixar-torneios.js pseudonimiza uid 1:1 por token estável (uid0135), então uid
// real vira token e NUNCA vira ''. Se nenhum inscrito tivesse uid, "sem conta" seria só o
// anonimizador tendo apagado tudo — e o invariante acima passaria sem provar nada.
if (fs.existsSync(fx)) {
  const todos = JSON.parse(fs.readFileSync(fx, 'utf8'));
  let comUid = 0;
  todos.forEach(t => nomesComConta(t).forEach(() => comUid++));
  ok(comUid > 0, `a fixture preserva uid (${comUid} pares nome↔uid) — "sem conta" não é artefato da anonimização`);
}

console.log(`\n  ${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);

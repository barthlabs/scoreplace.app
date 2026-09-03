/* RE-CHAVEAR NÃO PODE APAGAR O GRUPO DE WHATSAPP DO JOGO
 * node tests/rechavear-nao-apaga-o-grupo-de-whats.test.js
 *
 * ⛔ O INCIDENTE: `CAMPOS_PRESERVADOS` (js/views/chaves-adapter.js) — a lista do que
 * SOBREVIVE a um redesenho de chave — trazia, na linha da "logística":
 *
 *     'court', 'schedule', 'waGroupUrl', 'waGroupId',
 *
 * `waGroupUrl` e `waGroupId` NÃO EXISTEM. Varredura no repositório inteiro: os dois nomes
 * apareciam SÓ nessa linha (e na cópia vendor dela). Ninguém nunca os escreveu e ninguém
 * nunca os leu. O campo real é `waGroup` — `{link, byUid, byName, at}` — e ele NÃO estava
 * na lista.
 *
 * ⇒ Consequência: TODO recálculo de chave (entrada tardia, crescimento, re-chaveamento)
 * apagava o link do grupo de WhatsApp de cada jogo. Em SILÊNCIO — o jogo continuava lá,
 * com placar, horário e quadra intactos; só o botão "Abrir grupo" sumia. A pessoa
 * concluiria que "o app perdeu o grupo" e montaria outro.
 *
 * ⚠️ E o comentário de `reconciliar` logo acima da lista JÁ PROMETIA o contrário: _"o
 * estado mutável (resultado, quadra, horário, presença, grupo de WhatsApp) volta pro lugar
 * sem nenhuma inferência"_. A promessa estava escrita; a lista é que não cumpria.
 * ⚠️ A LIÇÃO: nome de campo INVENTADO não falha alto. Ele preserva um campo que ninguém
 * escreve e deixa de preservar o que existe — as duas metades do erro, caladas.
 * [[feedback_verify_existence_in_code]]
 *
 * Roda contra `window._chavesAdapter` REAL (headless), não contra uma cópia da lista.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');
const H = require('./headless.js');
const W = H.window;
const A = W._chavesAdapter;

let falhas = 0, passou = 0;
const ok = (n, c, extra) => {
  if (c) { passou++; console.log('  ✓ ' + n); }
  else { falhas++; console.log('  ✗ ' + n + (extra ? '\n      ' + extra : '')); }
};

const LINK = 'https://chat.whatsapp.com/AbCdEfGhIjK';
const WA = { link: LINK, byUid: 'uA', byName: 'Ana', at: 1756800000000, opId: '00000000-0000-4000-8000-000000000001' };
const parts = (n) => Array.from({ length: n }, (_, i) => ({ displayName: 'D' + (i + 1), uid: 'u' + (i + 1) }));

console.log('──── re-chavear não apaga o grupo de whats ────');

// ═══ ① A LISTA ════════════════════════════════════════════════════════════════
console.log('\n① a lista do que sobrevive ao redesenho');
{
  const L = A.CAMPOS_PRESERVADOS || [];
  ok('⭐ `waGroup` está na lista', L.indexOf('waGroup') !== -1, JSON.stringify(L));
  ok('⛔ e os dois nomes INVENTADOS saíram', L.indexOf('waGroupUrl') === -1 && L.indexOf('waGroupId') === -1);
  ok('  → os vizinhos de logística continuam lá (não troquei uma perda por outra)',
    ['court', 'schedule', 'presenceP1', 'presenceP2'].every((c) => L.indexOf(c) !== -1));
  ok('  → e o resultado também', ['winner', 'scoreP1', 'sets', 'resultAt', 'wo'].every((c) => L.indexOf(c) !== -1));
}

// ═══ ② OS NOMES INVENTADOS NÃO EXISTEM EM LUGAR NENHUM ═══════════════════════
// É esta varredura que autoriza dizer "campo inexistente" em vez de "campo que eu acho
// que não é usado". Sem ela eu estaria adivinhando — que é exatamente como o erro nasceu.
console.log('\n② `waGroupUrl`/`waGroupId` não existem no app');
{
  const DIRS = ['js', 'functions', 'functions-autodraw', 'extension', 'extensions'];
  const IGNORA = /(^|\/)(node_modules|vendor|www|\.git)(\/|$)/;
  const achados = [];
  const anda = (dir) => {
    let itens = [];
    try { itens = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    itens.forEach((it) => {
      const p = path.join(dir, it.name);
      const rel = path.relative(ROOT, p);
      if (IGNORA.test(rel)) return;
      if (it.isDirectory()) return anda(p);
      if (!/\.(js|html|json|rules)$/.test(it.name)) return;
      const txt = fs.readFileSync(p, 'utf8');
      txt.split('\n').forEach((l, i) => {
        /* ⚠️ COMENTÁRIO NÃO CONTA. A lápide que explica os dois nomes mortos precisa
         * CITÁ-LOS — é o único jeito de o próximo leitor entender por que a linha mudou.
         * O que este teste procura é USO: identificador em código. Contar a lápide como
         * ocorrência obrigaria a apagar a explicação pra o teste passar, e explicação
         * apagada é como o erro volta. */
        const t = l.trim();
        if (t.startsWith('*') || t.startsWith('//') || t.startsWith('/*')) return;
        if (/waGroupUrl|waGroupId/.test(l)) achados.push(rel + ':' + (i + 1) + ': ' + t);
      });
    });
  };
  DIRS.forEach((d) => anda(path.join(ROOT, d)));
  ok('⛔ nenhuma ocorrência sobrou no código do app', achados.length === 0, achados.join('\n      '));

  // e o campo REAL é escrito e lido, com esse nome
  const wa = fs.readFileSync(path.join(ROOT, 'js/views/wa-group.js'), 'utf8');
  ok('⭐ o campo real É `waGroup`, e é ele que o chip lê', /m\.waGroup && m\.waGroup\.link/.test(wa));
}

// ═══ ③ COMPORTAMENTO: reconciliar carrega o waGroup pro jogo redesenhado ═════
console.log('\n③ o redesenho leva o grupo junto (reconciliar, código real)');
{
  const antigos = [
    { id: 'p0-VC-R1-P1', _sig: '1|normal:#1 x #8', p1: 'D1', p2: 'D8', waGroup: JSON.parse(JSON.stringify(WA)), court: 'Quadra 3', schedule: { options: ['x'] }, winner: 'D1', scoreP1: 6, scoreP2: 2 },
    { id: 'p0-VC-R1-P2', _sig: '1|normal:#4 x #5', p1: 'D4', p2: 'D5' },
  ];
  const novos = [
    { id: 'p0-VC-R1-P1', _sig: '1|normal:#1 x #8', p1: 'D1', p2: 'D8' },
    { id: 'p0-VC-R1-P2', _sig: '1|normal:#4 x #5', p1: 'D4', p2: 'D5' },
  ];
  const r = A.reconciliar(antigos, novos);
  const j = r.matches[0];
  ok('⭐ o jogo redesenhado recebe o `waGroup` de volta', !!(j.waGroup && j.waGroup.link === LINK), JSON.stringify(j.waGroup));
  ok('  → INTEIRO: link, autoria, instante e opId', JSON.stringify(j.waGroup) === JSON.stringify(WA), JSON.stringify(j.waGroup));
  ok('  → junto com quadra, horário e placar (a promessa do comentário, agora cumprida)',
    j.court === 'Quadra 3' && !!j.schedule && j.winner === 'D1' && j.scoreP1 === 6);
  ok('⛔ e o jogo que não tinha grupo continua sem', !r.matches[1].waGroup);

  // a assinatura estrutural continua mandando: confronto DIFERENTE não herda nada
  const outros = [{ id: 'p0-VC-R1-P1', _sig: '1|normal:#1 x #9', p1: 'D1', p2: 'D9' }];
  const r2 = A.reconciliar(antigos, outros);
  ok('⛔ id igual com CONFRONTO diferente NÃO herda o grupo (nem o placar)',
    !r2.matches[0].waGroup && !r2.matches[0].winner,
    'colar o link de outro confronto seria mandar 4 pessoas pro grupo errado');
}

// ═══ ④ FIM A FIM: entrada tardia num torneio de verdade ══════════════════════
console.log('\n④ fim a fim: uma dupla chega atrasada e o grupo sobrevive');
{
  const b = A.build(8, 'simples', { ns: 'p0-' });
  const jogos = b.matches;
  // grupo de WhatsApp em dois jogos da R1, como na quadra
  const r1 = jogos.filter((m) => m.id.indexOf('-R1-') !== -1 && m.p1 && m.p2);
  ok('a chave de 8 nasceu com jogos na R1', r1.length >= 2, 'r1: ' + r1.length);
  r1[0].waGroup = JSON.parse(JSON.stringify(WA));
  r1[1].waGroup = { link: LINK };            // irmão espelhado: só o link (cânone do 2.0.101)
  const alvo0 = r1[0].id, alvo1 = r1[1].id;
  // e um placar, pra provar que o grupo viaja junto com o que já era preservado
  r1[0].winner = r1[0].p1; r1[0].scoreP1 = 6; r1[0].scoreP2 = 3; r1[0].resultAt = 111;

  /* ⚠️ 8→9 CRUZA A POTÊNCIA DE 2 e é o caso em que a chave inteira é re-semeada: os ids
   * estruturais mudam de confronto, `reconciliar` não reancora nada e `preservados` volta
   * ZERO. Isso vale pro grupo de WhatsApp exatamente como já valia pro placar — não é
   * regressão desta leva, é a natureza do redesenho, e o motor tem guarda própria pra
   * quando um jogo DISPUTADO some. Medido aqui pra a fronteira ficar escrita. */
  const rec = A.recalcularComTardio(jogos, 9, 'simples', { ns: 'p0-' });
  const sobrouGrupo = rec.ok && (rec.matches || []).some((m) => m.waGroup);
  const sobrouPlacar = rec.ok && (rec.matches || []).some((m) => m.winner && m.resultAt === 111);
  ok('⚠️ cruzar a potência de 2 (8→9) re-semeia: grupo E placar seguem a MESMA sorte',
    sobrouGrupo === sobrouPlacar,
    'grupo sobreviveu=' + sobrouGrupo + ' · placar sobreviveu=' + sobrouPlacar +
    ' — o que não pode é o grupo sumir onde o placar fica');
  void alvo0; void alvo1;

  // o crescimento NORMAL — o caso da quadra, e onde o link sumia: 9 → 10
  const b9 = A.build(9, 'simples', { ns: 'p0-' });
  const r1b = b9.matches.filter((m) => m.id.indexOf('-R1-') !== -1 && m.p1 && m.p2);
  r1b[0].waGroup = JSON.parse(JSON.stringify(WA));
  r1b[1].waGroup = { link: LINK };
  r1b[0].winner = r1b[0].p1; r1b[0].scoreP1 = 6; r1b[0].scoreP2 = 3; r1b[0].resultAt = 111;
  const id0 = r1b[0].id, id1 = r1b[1].id;

  const rec2 = A.recalcularComTardio(b9.matches, 10, 'simples', { ns: 'p0-' });
  ok('⭐ 9→10 recalcula de verdade', rec2.ok === true, JSON.stringify(rec2 && rec2.motivo));
  const porId = {};
  (rec2.matches || []).forEach((m) => { porId[m.id] = m; });
  ok('⭐ o portador do grupo ATRAVESSOU o recálculo com o link',
    !!(porId[id0] && porId[id0].waGroup && porId[id0].waGroup.link === LINK),
    'antes do conserto este era o momento exato em que o link sumia');
  ok('  → com a autoria intacta', porId[id0] && porId[id0].waGroup.byUid === 'uA' && porId[id0].waGroup.opId === WA.opId);
  ok('  → e o placar também (a preservação não regrediu)',
    porId[id0] && porId[id0].winner === r1b[0].winner && porId[id0].scoreP1 === 6);
  ok('⭐ o jogo IRMÃO manteve o espelho de link pequeno',
    !!(porId[id1] && porId[id1].waGroup && porId[id1].waGroup.link === LINK) &&
    Object.keys(porId[id1].waGroup).length === 1,
    JSON.stringify(porId[id1] && porId[id1].waGroup));
  const comGrupo = (rec2.matches || []).filter((m) => m.waGroup).map((m) => m.id).sort();
  ok('⛔ e NENHUM outro jogo ganhou grupo do nada', comGrupo.join(',') === [id0, id1].sort().join(','), comGrupo.join(','));
}

console.log('\n' + (falhas === 0 ? '✅ rechavear-nao-apaga-o-grupo-de-whats: ' + passou + ' ok' : '❌ ' + falhas + ' falha(s) em ' + (passou + falhas)));
process.exit(falhas === 0 ? 0 : 1);

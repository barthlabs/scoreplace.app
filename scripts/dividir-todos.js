#!/usr/bin/env node
/* dividir-todos.js — leva TODOS os torneios pro formato novo, um por um.
 *
 * POR QUE FAZER OS OUTROS, já que nenhum chega perto do teto: depois do Confra, o caminho
 * novo era exercitado por 1 torneio contra 38. ⛔ Caminho que é EXCEÇÃO apodrece — a suíte
 * e o uso real martelam o comum, e o raro quebra em silêncio. E a exceção ser justo o
 * torneio ao vivo com 148 pessoas é o pior arranjo possível. Consistência aqui não é
 * estética: é o que faz o defeito aparecer num torneio pequeno em vez de no grande.
 *
 * ⭐ E é barato: a maioria não tem jogo NENHUM ainda — neles o marcador é só um campo, sem
 * nada pra mover e nada pra perder.
 *
 * ⛔ CADA TORNEIO PASSA PELO MESMO RITO do salto do Confra (scripts/salto-fase2.js):
 * dois backups congelados e RELIDOS, prova `remontar(dividir(t)) === t`, subcoleção
 * escrita e conferida remontando DELA, e só então o documento perde os jogos.
 * ⛔ Um torneio que falhe NÃO derruba os outros e NÃO é dividido pela metade — ele fica
 * como está e sai na lista do fim.
 *
 * Uso:  node scripts/dividir-todos.js               # em seco, mostra o plano
 *       node scripts/dividir-todos.js --aplicar
 *       node scripts/dividir-todos.js --aplicar --pular tour_1780009816637
 */
const path = require('path');
const { execFileSync } = require('child_process');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
if (!admin.apps.length) admin.initializeApp({ projectId: 'scoreplace-app' });
const db = admin.firestore();
const argv = process.argv.slice(2);
const APLICAR = argv.indexOf('--aplicar') !== -1;
const iP = argv.indexOf('--pular');
const PULAR = new Set(iP >= 0 ? argv.slice(iP + 1).filter((a) => !a.startsWith('--')) : []);

(async () => {
  const snap = await db.collection('tournaments').get();
  const alvos = [];
  snap.forEach((d) => {
    const t = d.data() || {};
    if (Array.isArray(t._semPesados) && t._semPesados.indexOf('matches') !== -1) return;
    if (PULAR.has(d.id)) return;
    const j = (t.rounds || []).reduce((a, r) => a + ((r.matches || []).length), 0) +
              ((t.matches || []).length) +
              (t.groups || []).reduce((a, g) => a + ((g.matches || []).length), 0);
    alvos.push({ id: d.id, nome: (t.name || d.id).slice(0, 40), jogos: j,
      kb: (Buffer.byteLength(JSON.stringify(t), 'utf8') / 1024).toFixed(1) });
  });
  // ⭐ os SEM JOGO primeiro: são o caso trivial e provam o rito antes dos que têm dado.
  alvos.sort((a, b) => a.jogos - b.jogos);
  console.log(alvos.length + ' torneio(s) no formato velho  ·  ' +
    alvos.filter((a) => !a.jogos).length + ' sem jogo (trivial)  ·  ' +
    alvos.filter((a) => a.jogos).length + ' com jogo\n');
  if (!APLICAR) {
    alvos.forEach((a) => console.log('  ' + String(a.jogos).padStart(4) + ' jogos  ' +
      String(a.kb).padStart(7) + ' KB  ' + a.nome));
    console.log('\n(em seco — nada gravado; rode com --aplicar)');
    process.exit(0);
  }
  const okList = [], falhou = [];
  for (const a of alvos) {
    process.stdout.write('▸ ' + a.nome.padEnd(42) + String(a.jogos).padStart(4) + ' jogos … ');
    try {
      // ⭐ Chama o MESMO script do salto do Confra. Reimplementar o rito aqui seria criar
      // uma segunda versão dele — e é exatamente disso que este projeto já apanhou.
      const out = execFileSync(process.execPath,
        [path.join(__dirname, 'salto-fase2.js'), a.id, '--aplicar'],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
      const m = /documento dividido: ([\d.]+ KB) → ([\d.]+ KB)/.exec(out);
      console.log('✓' + (m ? '  ' + m[1] + ' → ' + m[2] : ''));
      okList.push(a.id);
    } catch (e) {
      const saida = ((e.stdout || '') + (e.stderr || '')).split('\n')
        .filter((l) => /ABORTADO|⛔/.test(l)).join(' | ').slice(0, 200);
      console.log('✗  ' + (saida || (e.message || '').slice(0, 120)));
      falhou.push({ id: a.id, nome: a.nome, porque: saida });
    }
  }
  console.log('\n═══ ' + okList.length + ' dividido(s) · ' + falhou.length + ' falhou/falharam');
  if (falhou.length) {
    console.log('⛔ os que ficaram como estavam (nada perdido, nada pela metade):');
    falhou.forEach((f) => console.log('   ' + f.nome + '  —  ' + f.porque));
  }
  process.exit(falhou.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });

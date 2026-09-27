'use strict';
/* A DECISÃO DO TARDIO EM CHAVE DE FOLGA, CONTRA O FIRESTORE DE VERDADE (emulador).
 * node tests/decisao-do-tardio-na-folga-emulador.test.js
 *
 * ⛔⛔ POR QUE ESTE ARQUIVO EXISTE, além do teste de unidade que já exercita a regra pura: a regra
 * pura não prova PERSISTÊNCIA. Ela devolve "recuse" ou "aceite"; quem grava (ou deixa de gravar) é a
 * callable, dentro de uma transação. As duas perguntas que só aqui se respondem são:
 *   ① quando a decisão é recusada, o documento fica EXATAMENTE como estava — nada de meia-gravação;
 *   ② quando é aceita, a pendência some e a chave refeita fica no banco.
 * Um teste que só chama a função pura passaria verde com a callable gravando errado.
 *
 * ⚠️ NÃO ENTRA NO `npm test`: precisa do emulador do Firestore, que não existe em toda máquina. Ele
 * é do grupo `emulador-manual`, como os irmãos.
 */
const assert = require('assert/strict'), path = require('path');
const ROOT = path.join(__dirname, '..');

if (!process.env.FIRESTORE_EMULATOR_HOST) {
  const { spawnSync, execFileSync } = require('child_process');
  const fs = require('fs');
  /* ⛔ o temporário vive DENTRO do projeto e é apagado depois — ordem do dono, e ainda contorna o
   * sandbox que recusa `mktemp` em /tmp. */
  const base = path.join(ROOT, 'tmp');
  fs.mkdirSync(base, { recursive: true });
  const temp = fs.mkdtempSync(path.join(base, 'sp-tardio-emulador-'));
  const port = Number(execFileSync(process.execPath, ['-e',
    "const s=require('net').createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close();});"],
    { encoding: 'utf8' }).trim());
  const config = path.join(temp, 'firebase.json');
  fs.writeFileSync(config, JSON.stringify({
    firestore: { rules: path.join(ROOT, 'tests/concurrency/firestore.allow.rules') },
    emulators: { firestore: { host: '127.0.0.1', port }, ui: { enabled: false }, singleProjectMode: true }
  }));
  const result = spawnSync('firebase',
    ['emulators:exec', '--only', 'firestore', '--config', config, '--project', 'demo-scoreplace',
      'node tests/decisao-do-tardio-na-folga-emulador.test.js'],
    { cwd: ROOT, encoding: 'utf8', env: { ...process.env, PATH: '/opt/homebrew/opt/openjdk/bin:' + process.env.PATH }, timeout: 180000 });
  fs.rmSync(temp, { recursive: true, force: true });
  const saida = (result.stdout || '') + (result.stderr || '');
  process.stdout.write(saida);
  if (result.error) console.error(result.error);
  /* mesma ressalva medida dos irmãos: quem dá o veredito é o teste, não o desligamento da CLI */
  if (result.status !== 0 && /Script exited successfully \(code 0\)/.test(saida)) {
    console.error('\n⚠️  O TESTE PASSOU; quem falhou foi o desligamento do emulador.\n');
    process.exit(0);
  }
  process.exit(result.status === null ? 1 : result.status);
}

assert(/^127\.0\.0\.1:\d+$/.test(process.env.FIRESTORE_EMULATOR_HOST), 'só emulador local');
process.env.GCLOUD_PROJECT = 'demo-scoreplace';
process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'demo-scoreplace' });

const functions = require('../functions-autodraw/index');
const { getFirestore } = require('module').createRequire(path.join(ROOT, 'functions-autodraw/index.js'))('firebase-admin/firestore');

/* a chave é construída pelo adapter REAL — inventar matches à mão daria uma chave que o motor não
 * reconhece, e o teste mediria a recusa errada. */
const H = require('./headless.js');
['chaves.js', 'chaves-adapter.js'].forEach(function (f) { try { H.load(f); } catch (e) {} });
const A = H.window._chavesAdapter;

(async () => {
  const db = getFirestore();
  const dono = 'tardio-emulador-dono';
  const gente = (n) => Array.from({ length: n }, (_, i) => ({ name: 'D' + (i + 1), uid: 'u' + (i + 1) }));
  const tardio = { name: 'Tardio 17', uid: 'u17', presente: true };

  /* monta o torneio com a pendência JÁ gravada, pelo mesmo caminho da produção */
  const semear = async (sufixo) => {
    const id = 'tour_' + Date.now() + '_' + String(sufixo).padEnd(32, 'x');
    const base = { id, politicaDaChave: 'bye',
      matches: A.build(16, 'simples', { participantes: gente(16), politicaDaChave: 'bye' }).matches };
    A.integrarTardiosElim(base, [tardio]);
    const linha = Object.keys(base.tardiosPendentesPorLinha || {})[0];
    assert(linha != null, 'a semeadura precisa produzir uma pendência');
    /* ⛔ SEMEIA DIVIDIDO, que desde 2.3.113 é a única forma que existe: o gravador RECUSA torneio
     * sem o marcador, e esta fixture ficou vermelha no dia em que a recusa entrou — o portão
     * pegando o meu próprio teste. Marcador E contador, como a produção nasce. */
    await db.doc('tournaments/' + id).set({
      name: 'Folga ' + sufixo, sport: 'Beach Tennis', format: 'Eliminatórias Simples',
      creatorUid: dono, politicaDaChave: 'bye',
      _semPesados: ['opponentHistory'], _nPartes: { opponentHistory: 0 }, opponentHistory: [],
      /* ⛔ sem isto ninguém entra por caminho nenhum: "Novos Confrontos" é o primeiro portão do
       * coletor de tardios, e é ortogonal a inscrições abertas. O teste tem de ligar o que o
       * organizador ligaria, senão mede a recusa errada. */
      newMatchups: true, lateEnrollment: 'expand',
      /* ⛔ e PRESENÇA: em torneio de um dia o coletor só pega quem está presente — cânone "só
       * presentes". Sem isto o candidato é filtrado e a medição seria da recusa errada. */
      checkedIn: { u17: Date.now() },   // o valor é o INSTANTE: presença tem validade, `true` não é fresca
      participants: gente(16), standbyParticipants: [tardio],
      matches: base.matches, tardiosPendentesPorLinha: base.tardiosPendentesPorLinha
    });
    const rev = base.tardiosPendentesPorLinha[linha].revisaoDaChave;
    return { id, linha, rev, doc: db.doc('tournaments/' + id) };
  };
  const foto = (d) => JSON.stringify((d.matches || []).map((m) => [m.id, m.p1, m.p2]));

  /* ── ① QUEM NÃO É DA ORGANIZAÇÃO NÃO DECIDE, E NADA É GRAVADO ────────────── */
  {
    const s = await semear('a');
    const antes = (await s.doc.get()).data();
    await assert.rejects(functions.resolvePendingLateBye.run({
      auth: { uid: 'intruso' }, data: { tournamentId: s.id, linha: s.linha, revisaoDaChave: s.rev, acao: 'confirmar' }
    }), { code: 'permission-denied' });
    const dps = (await s.doc.get()).data();
    assert.equal(foto(dps), foto(antes), 'confrontos intactos');
    assert(dps.tardiosPendentesPorLinha[s.linha], 'pendência intacta');
    console.log('✓ ① intruso é recusado e o documento não muda');
  }

  /* ── ② REVISÃO VELHA: RECUSA E PRESERVA ──────────────────────────────────── */
  {
    const s = await semear('b');
    const antes = (await s.doc.get()).data();
    await assert.rejects(functions.resolvePendingLateBye.run({
      auth: { uid: dono }, data: { tournamentId: s.id, linha: s.linha, revisaoDaChave: 'revisao-velha', acao: 'confirmar' }
    }), { code: 'failed-precondition' });
    const dps = (await s.doc.get()).data();
    assert.equal(foto(dps), foto(antes), 'confrontos intactos');
    assert(dps.tardiosPendentesPorLinha[s.linha], 'pendência preservada');
    console.log('✓ ② revisão velha é recusada e nada é gravado');
  }

  /* ── ③ QUEM FOI PROPOSTO SAIU DA ESPERA: RECUSA E PRESERVA ───────────────
   * ⛔ Era o defeito: eu apagava a pendência antes de o motor aplicar, então ela sumia sem ninguém
   * entrar. Aqui a espera é esvaziada de propósito. */
  {
    const s = await semear('c');
    await s.doc.update({ standbyParticipants: [] });
    const antes = (await s.doc.get()).data();
    await assert.rejects(functions.resolvePendingLateBye.run({
      auth: { uid: dono }, data: { tournamentId: s.id, linha: s.linha, revisaoDaChave: s.rev, acao: 'confirmar' }
    }), { code: 'failed-precondition' });
    const dps = (await s.doc.get()).data();
    assert.equal(foto(dps), foto(antes), 'confrontos intactos');
    assert(dps.tardiosPendentesPorLinha[s.linha], 'pendência PRESERVADA — não pode sumir sem ninguém entrar');
    console.log('✓ ③ espera sem quem foi proposto: recusa, e a pendência continua lá');
  }

  /* ── ④ CAMINHO FELIZ: A PENDÊNCIA SAI E A CHAVE REFEITA FICA GRAVADA ─────── */
  {
    const s = await semear('d');
    const antes = (await s.doc.get()).data();
    const out = await functions.resolvePendingLateBye.run({
      auth: { uid: dono }, data: { tournamentId: s.id, linha: s.linha, revisaoDaChave: s.rev, acao: 'confirmar' }
    });
    assert.equal(out.changed, true, 'a decisão valeu');
    const dps = (await s.doc.get()).data();
    assert(!(dps.tardiosPendentesPorLinha || {})[s.linha], 'pendência removida');
    assert.notEqual(foto(dps), foto(antes), 'a chave foi refeita e GRAVADA');
    const entrou = (dps.matches || []).some((m) => m.p1 === tardio.name || m.p2 === tardio.name);
    assert(entrou, 'o tardio está na chave gravada');
    /* ⛔ segunda confirmação (a concorrente que chega depois): não estoura e não muda nada */
    const foto2 = foto(dps);
    const out2 = await functions.resolvePendingLateBye.run({
      auth: { uid: dono }, data: { tournamentId: s.id, linha: s.linha, revisaoDaChave: s.rev, acao: 'confirmar' }
    });
    assert.equal(out2.changed, false, 'a segunda confirmação não muda nada');
    assert.equal(foto((await s.doc.get()).data()), foto2, 'e o documento continua igual');
    console.log('✓ ④ confirmação grava a chave refeita, remove a pendência, e a segunda é inócua');
  }

  /* ── ⑤ ARQUIVAR: A PENDÊNCIA SAI E A CHAVE NÃO MUDA ──────────────────────── */
  {
    const s = await semear('e');
    const antes = (await s.doc.get()).data();
    const out = await functions.resolvePendingLateBye.run({
      auth: { uid: dono }, data: { tournamentId: s.id, linha: s.linha, revisaoDaChave: s.rev, acao: 'cancelar' }
    });
    assert.equal(out.changed, true, 'arquivar vale');
    const dps = (await s.doc.get()).data();
    assert(!(dps.tardiosPendentesPorLinha || {})[s.linha], 'pendência arquivada');
    assert.equal(foto(dps), foto(antes), 'e NENHUM confronto mudou');
    console.log('✓ ⑤ arquivar remove a pendência sem tocar na chave');
  }

  console.log('\n✅ decisão do tardio em chave de folga: persistência provada contra o Firestore');
  await db.terminate();
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });

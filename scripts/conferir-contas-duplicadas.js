'use strict';
/* ⛔⛔ CENSO DE CONTAS QUE PARECEM SER DA MESMA PESSOA — SÓ LEITURA, NUNCA ESCREVE.
 *
 * Por que existe: a porta que avisa o organizador (`getTournamentDuplicateAccounts`) olha DENTRO
 * de um torneio, e está certa nisso — ela avisa no momento em que o estrago aconteceria, que é a
 * mesma pessoa inscrita duas vezes. Mas medido em 25/set/2026: dos 9 pares suspeitos abertos,
 * ZERO estavam co-inscritos. Ou seja, eles existem e ninguém os vê até coincidirem num torneio.
 * Este censo é a visão de fora, para o dono decidir — fusão é decisão humana, nunca automática.
 *
 * ⛔ NÃO FUNDE, NÃO DISPENSA, NÃO GRAVA. Fusão exige prova de controle das duas contas ou decisão
 * humana registrada, e desfazer custa seis lugares (ver o incidente Cilone).
 *
 *   node scripts/conferir-contas-duplicadas.js
 */
const admin = require('firebase-admin');
const path = require('path');
const D = require(path.join(__dirname, '..', 'functions', 'duplicate-person-core.js'));

if (require.main === module) {
  admin.initializeApp();
  const db = admin.firestore();
  (async () => {
    const snap = await db.collection('users').get();
    const vivos = [];
    snap.docs.forEach((d) => {
      const u = d.data() || {};
      if (u.mergedInto) return;                 // lápide: conta absorvida não conta
      vivos.push({
        uid: d.id, nome: u.displayName || '', email: u.email || '', telefone: u.phone || '',
        letzplayHandle: u.letzplayHandle || '', authProvider: u.authProvider || '',
        dispensados: [].concat(
          Array.isArray(u.dupDismissedInfo) ? u.dupDismissedInfo : [],
          Array.isArray(u.dupDismissed) ? u.dupDismissed : []),
      });
    });

    const vistos = {}, pares = [];
    for (const c of vivos) {
      const r = D.detectarMesmaPessoa(c, vivos.filter((x) => x.uid !== c.uid), {});
      (r && r.todos || []).forEach((t) => {
        if (!t || !t.uid) return;
        const k = [c.uid, t.uid].sort().join('|');
        if (vistos[k]) return; vistos[k] = 1;
        const o = vivos.find((x) => x.uid === t.uid) || {};
        pares.push({ a: c, b: o, sinal: t.semelhanca || t.motivo, dispensado: !!t.dispensado });
      });
    }

    const ts = await db.collection('tournaments').get();
    pares.forEach((p) => {
      p.juntos = [];
      ts.docs.forEach((td) => {
        const t = td.data() || {};
        const mu = Array.isArray(t.memberUids) ? t.memberUids : [];
        if (mu.indexOf(p.a.uid) !== -1 && mu.indexOf(p.b.uid) !== -1) {
          p.juntos.push((t.name || td.id) + (t.status === 'active' ? ' (em andamento)' : ''));
        }
      });
    });

    const abertos = pares.filter((p) => !p.dispensado);
    const coinscritos = abertos.filter((p) => p.juntos.length);
    console.log('\n▸ ' + vivos.length + ' contas vivas · ' + abertos.length + ' par(es) suspeito(s) ABERTO(s) · '
      + pares.filter((p) => p.dispensado).length + ' já dispensado(s)');
    console.log('▸ ' + coinscritos.length + ' par(es) NO MESMO TORNEIO — é onde o estrago acontece\n');
    abertos.sort((x, y) => y.juntos.length - x.juntos.length).forEach((p) => {
      const marca = p.juntos.length ? '⛔ MESMO TORNEIO' : '  ';
      console.log(marca + ' ' + p.sinal.padEnd(12) + ' ' + (p.a.nome || '(sem nome)') + '  |  ' + (p.b.nome || '(sem nome)')
        + '   [' + (p.a.authProvider || '?') + ' + ' + (p.b.authProvider || '?') + ']'
        + (p.juntos.length ? '  → ' + p.juntos.join(', ') : ''));
    });
    console.log('\n⛔ Só leitura. Fusão é decisão sua, e desfazer custa seis lugares.\n');
    process.exit(0);
  })().catch((e) => { console.error(e); process.exit(1); });
}
module.exports = {};

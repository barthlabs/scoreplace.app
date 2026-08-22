'use strict';
/*
 * orphan-profile-run.js — A VARREDURA que cura conta do Auth sem perfil.
 *
 * O que roda em produção é ESTE arquivo (a CF `healOrphanProfiles` é só o
 * gatilho agendado). A REGRA mora em orphan-profile-core.js, pura e testada;
 * aqui fica o I/O: listar o Auth, ler os docs em lote, consultar `loginRedirects`
 * e gravar.
 *
 * ⚠️ COMEÇA EM ENSAIO, e isso é proposital (mesmo padrão do phone-nudge):
 * `appConfig/orphanProfiles.enabled` nasce ausente → dryRun. A rotina mede, grava
 * o relatório da rodada e não toca em ninguém. Criar perfil é escrever no nome de
 * gente real — o dono liga quando conferir a primeira medição:
 *   appConfig/orphanProfiles = { enabled: true }
 *
 * IDEMPOTÊNCIA: a escrita é `create()`. Se o doc nasceu entre a leitura e a
 * gravação (a pessoa voltou nesse instante), ALREADY_EXISTS é ignorado — nunca
 * sobrescrevemos um perfil de verdade com uma semente.
 */
const core = require('./orphan-profile-core');

const CONFIG_DOC = 'appConfig/orphanProfiles';
const RUNS = 'orphanProfileRuns';
const MAX_POR_RODADA = 200;   // trava de segurança: rodada que quer criar mais que isso PARA e avisa

async function lerConfig(db) {
  const padrao = { enabled: false, maxPorRodada: MAX_POR_RODADA };
  try {
    const [col, doc] = CONFIG_DOC.split('/');
    const snap = await db.collection(col).doc(doc).get();
    if (!snap.exists) return padrao;
    return Object.assign({}, padrao, snap.data() || {});
  } catch (e) {
    console.warn('[healOrphanProfiles] config ilegível, seguindo em ENSAIO:', e.message);
    return padrao;
  }
}

/* auth: admin.auth() | db: admin.firestore() | agoraMs: relógio injetável */
async function run(auth, db, agoraMs) {
  const agora = agoraMs == null ? Date.now() : agoraMs;
  const cfg = await lerConfig(db);
  const dryRun = cfg.enabled !== true;
  const limite = Math.max(1, parseInt(cfg.maxPorRodada, 10) || MAX_POR_RODADA);

  let contasNoAuth = 0;
  const criadas = [];
  const puladas = {};
  const falhas = [];
  let pageToken;

  do {
    const pagina = await auth.listUsers(1000, pageToken);
    contasNoAuth += pagina.users.length;

    for (let i = 0; i < pagina.users.length; i += 50) {
      const lote = pagina.users.slice(i, i + 50);
      const snaps = await db.getAll(...lote.map((u) => db.collection('users').doc(u.uid)));

      for (let j = 0; j < lote.length; j++) {
        const u = lote[j];
        const conta = {
          uid: u.uid,
          email: u.email || '',
          phoneNumber: u.phoneNumber || '',
          displayName: u.displayName || '',
          photoURL: u.photoURL || '',
          providerId: (u.providerData && u.providerData[0] && u.providerData[0].providerId) || '',
          creationTimeMs: (u.metadata && u.metadata.creationTime) ? new Date(u.metadata.creationTime).getTime() : 0,
        };
        const temPerfil = snaps[j].exists;

        // A consulta ao `loginRedirects` só vale a pena pra quem já passou dos
        // filtros baratos — e ela é a que NÃO pode ser pulada (ver o ⛔ no core).
        let dono = null;
        if (!temPerfil) {
          const previa = core.decidir(conta, false, null, agora);
          if (previa.acao === 'criar') {
            for (const chave of core.chavesDeRedirect(conta)) {
              try {
                const r = await db.collection('loginRedirects').doc(chave).get();
                if (r.exists && r.data().ownerUid) { dono = r.data().ownerUid; break; }
              } catch (e) {
                // Não dá pra provar que NÃO há resgate → não cria. Errar pro lado
                // de deixar órfã é reversível; prender a pessoa numa conta vazia não.
                falhas.push({ uid: conta.uid, erro: 'loginRedirects ilegível: ' + e.message });
                dono = conta.uid + '__leitura_falhou';
                break;
              }
            }
          }
        }

        const d = core.decidir(conta, temPerfil, dono, agora);
        if (d.acao === 'pular') { puladas[d.motivo] = (puladas[d.motivo] || 0) + 1; continue; }

        if (criadas.length >= limite) {
          falhas.push({ uid: conta.uid, erro: 'limite da rodada atingido (' + limite + ')' });
          continue;
        }
        if (dryRun) {
          criadas.push({ uid: conta.uid, provider: d.semente.authProvider, dryRun: true });
          continue;
        }
        try {
          await db.collection('users').doc(conta.uid).create(d.semente);
          criadas.push({ uid: conta.uid, provider: d.semente.authProvider });
          console.log('[healOrphanProfiles] perfil criado uid=' + conta.uid + ' provider=' + d.semente.authProvider);
        } catch (e) {
          if (String(e.code) === '6' || /already-exists/i.test(String(e.code || e.message))) {
            puladas.nasceu_no_meio = (puladas.nasceu_no_meio || 0) + 1;
          } else {
            falhas.push({ uid: conta.uid, erro: e.message });
            console.error('[healOrphanProfiles] falhou uid=' + conta.uid + ':', e.message);
          }
        }
      }
    }
    pageToken = pagina.pageToken;
  } while (pageToken);

  const relatorio = {
    at: new Date(agora).toISOString(),
    dryRun,
    contasNoAuth,
    orfasEncontradas: criadas.length + falhas.length,
    criadas: criadas.length,
    uidsCriados: criadas.map((c) => c.uid),
    puladas,
    falhas,
  };
  console.log('[healOrphanProfiles]', JSON.stringify(relatorio));
  try {
    // Relatório por dia (BRT) — a PROVA da rodada mora no dado, não num log que expira.
    const dia = new Date(agora).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
    await db.collection(RUNS).doc(dia).set(relatorio, { merge: true });
  } catch (e) { console.warn('[healOrphanProfiles] relatório não gravado:', e.message); }
  return relatorio;
}

module.exports = { run, lerConfig, CONFIG_DOC, RUNS };

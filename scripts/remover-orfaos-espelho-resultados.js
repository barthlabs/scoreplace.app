/* Remove APENAS `results` que o conferidor provou estarem fora de matches.
 *
 * Uso:
 *   node scripts/remover-orfaos-espelho-resultados.js --tid <id>          # só mede
 *   node scripts/remover-orfaos-espelho-resultados.js --tid <id> --apply  # remove os seguros
 *
 * Guardas (falha fechada): cada execução relê a fonte canônica; nenhuma ausência ou
 * divergência é aceitável; placar, W.O., replay ou proposta pendente bloqueiam tudo; após
 * a exclusão, relê de novo e exige que não tenha restado órfão. Não há modo global.
 */
'use strict';

const { execFileSync } = require('node:child_process');
const https = require('node:https');
const path = require('node:path');

const args = process.argv.slice(2);
const at = args.indexOf('--tid');
const tid = at >= 0 ? String(args[at + 1] || '').trim() : '';
const apply = args.includes('--apply');
if (!tid || tid.startsWith('-') || !args.includes('--tid')) {
  throw new Error('uso: node scripts/remover-orfaos-espelho-resultados.js --tid <id> [--apply]');
}

const checker = path.join(__dirname, 'conferir-espelho-resultados.js');
function auditar() {
  const out = execFileSync(process.execPath, [checker, tid, '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] });
  const line = out.split('\n').find((x) => x.startsWith('@@RESULTS_AUDIT@@'));
  if (!line) throw new Error('conferidor não entregou o relatório estruturado');
  return JSON.parse(line.slice('@@RESULTS_AUDIT@@'.length));
}
function seguros(r) {
  if (r.missing || r.divergent) throw new Error('espelho canônico não está íntegro; limpeza recusada');
  const ruins = (r.orphans || []).filter((o) => o.risco.placar || o.risco.wo || o.risco.replay || o.risco.pendente);
  if (ruins.length) throw new Error('há órfão com placar, W.O., replay ou pendência; limpeza recusada: ' + ruins.map((o) => o.matchId).join(', '));
  return r.orphans || [];
}
function apagar(url, token) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request({ protocol: u.protocol, hostname: u.hostname, path: u.pathname, method: 'DELETE', headers: { Authorization: 'Bearer ' + token } }, (res) => {
      let body = ''; res.setEncoding('utf8'); res.on('data', (x) => { body += x; });
      res.on('end', () => (res.statusCode >= 200 && res.statusCode < 300) ? resolve() : reject(new Error('DELETE ' + res.statusCode + ': ' + body.slice(0, 300))));
    });
    req.on('error', reject); req.end();
  });
}

(async () => {
  const antes = auditar();
  const candidatos = seguros(antes);
  console.log(JSON.stringify({ tid, apply, canonicalMatches: antes.canonicalMatches, orphanCandidates: candidatos.map((o) => o.matchId) }, null, 2));
  if (!apply || !candidatos.length) return;

  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  const base = 'https://firestore.googleapis.com/v1/projects/scoreplace-app/databases/(default)/documents/tournaments/' + encodeURIComponent(tid) + '/results/';
  for (const item of candidatos) await apagar(base + encodeURIComponent(item.matchId), token);

  const depois = auditar();
  if (depois.missing || depois.divergent || depois.orphans.length) {
    throw new Error('pós-condição falhou: fonte ou espelho não ficou limpo');
  }
  console.log(JSON.stringify({ ok: true, tid, deleted: candidatos.map((o) => o.matchId), verifiedAt: new Date().toISOString() }, null, 2));
})().catch((e) => { console.error('⛔ limpeza não concluída:', e.message); process.exitCode = 1; });

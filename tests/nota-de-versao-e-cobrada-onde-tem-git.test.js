/* A TRAVA DA NOTA DE VERSÃO É COBRADA ONDE ELA PODE RESPONDER (leva 2.1.14)
 *
 * `scripts/check-release-notes.js` tem DUAS partes:
 *   (1) existe entrada da minor atual na nota?   — funciona em qualquer lugar
 *   (2) a nota está ATRASADA em relação ao código? — precisa de GIT
 *
 * ⚠️ E a parte 2 — a que pega OMISSÃO, que é o caso comum — nunca rodava no caminho da
 * publicação. O `hosting.predeploy` executa dentro da cópia extraída em /tmp (git archive,
 * sem `.git`), então o script cai no `if (!ultimoDaNota) return` e passa calado.
 * A trava que nasceu depois de a nota ser esquecida TRÊS vezes (v1.7.8, v1.7.49, v1.8.11)
 * era, exatamente ali, decorativa.
 *
 * MEDIDO em 27/ago/2026: a 2.1.13 foi ao ar SEM NOTA e o deploy não reclamou — o script
 * que a escreveria abortou antes por outro motivo, e nada no fluxo notou.
 *
 * Conserto: `deploy-hosting.sh` chama a trava no REPO, antes de extrair. É o único ponto
 * do fluxo com histórico. Mesma lição do check-deploy-alignment e do backup-bundle: o que
 * não é gate, não acontece.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── a nota de versão é cobrada onde há git ────');

const ROOT = path.join(__dirname, '..');
const sh = fs.readFileSync(path.join(ROOT, 'scripts', 'deploy-hosting.sh'), 'utf8');
const chk = fs.readFileSync(path.join(ROOT, 'scripts', 'check-release-notes.js'), 'utf8');

ok(/check-release-notes\.js/.test(sh),
   '⛔ o deploy-hosting.sh chama a trava da nota (é o único ponto do fluxo COM git)');

// tem que ser ANTES da extração — depois dela não há mais histórico pra consultar.
// ⚠️ ATUALIZADO na L6.R2.3: a extração virou a função `montar_copia`, DEFINIDA no topo do
// script e CHAMADA depois. Comparar contra o texto `git archive` passou a medir a
// DEFINIÇÃO, não o momento em que ela roda — e a pergunta aqui é sobre a ORDEM DE
// EXECUÇÃO. Por isso o marco passou a ser a CHAMADA (`montar_copia "`), que é onde a cópia
// nasce de fato. O invariante não mudou: a trava roda enquanto ainda há `.git`.
const iTrava = sh.indexOf('check-release-notes.js');
const iCopia = sh.indexOf('montar_copia "');
ok(iTrava > 0 && iCopia > 0 && iTrava < iCopia,
   'e é chamada ANTES de a cópia ser montada — depois, a cópia não tem .git e a pergunta fica sem resposta');
ok(sh.indexOf('montar_copia() {') < iCopia,
   '(a função é definida antes de ser chamada — é por isso que a medição é pela CHAMADA)');

// e tem que ABORTAR, não só avisar
const linha = sh.slice(iTrava - 200, iTrava + 200);
ok(/\|\| exit 1/.test(linha) || /set -e/.test(sh),
   'a trava BARRA o deploy (aviso que não barra é o mesmo que trava nenhuma)');

// a parte 2 continua existindo e continua dependendo de git — é o motivo de tudo isto
ok(/if \(!ultimoDaNota\) return;/.test(chk),
   'a parte 2 do script segue desistindo sem git — é justamente por isso que ela tem de ser chamada no repo');
ok(/git\(\['log', '-1', '--format=%H', '--', 'js\/release-notes\.js'\]\)/.test(chk),
   'e ela pergunta ao git quando a nota foi escrita pela última vez');

// ⛔ e o predeploy do firebase segue chamando também — não removi de lá.
// Lá ela ainda vale pela PARTE 1 (existe entrada da minor?), que não precisa de git.
const fbj = JSON.parse(fs.readFileSync(path.join(ROOT, 'firebase.json'), 'utf8'));
const pre = (fbj.hosting && fbj.hosting.predeploy) || [];
ok(pre.some(c => /check-release-notes/.test(c)),
   'o predeploy do hosting segue chamando a trava — lá a parte 1 (entrada da minor) ainda vale');

console.log(pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);

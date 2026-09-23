/* ⚰️ AS PORTAS APOSENTADAS NÃO VOLTAM.
 *
 * ⛔ POR QUE ESTE TESTE EXISTE. `setParticipantsGender` e `setParticipantsProfile` gravavam
 * `gender`/`skillBySport` no PERFIL GLOBAL de outra pessoa a pedido do organizador, **sem conferir
 * se o alvo estava no torneio dele** — e criar torneio é livre, então qualquer conta autenticada
 * alcançava o perfil de qualquer outra. Foram apagadas do projeto em 23/set/2026.
 *
 * ⛔ Porta apagada volta por descuido: alguém restaura um bloco, ou um script de deploy continua
 * nomeando o que não existe (e aí o deploy falha no pior momento). Este teste é o portão.
 *
 * ⚠️ Ele NÃO prova a remoção REMOTA — isso é pós-condição do release
 * (`firebase functions:list` não pode listar nenhuma das duas). Um teste de código fica verde
 * mesmo se o `functions:delete` tiver falhado.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const RAIZ = path.join(__dirname, '..');

const APOSENTADAS = ['setParticipantsGender', 'setParticipantsProfile'];
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m); } else { fail++; console.error('  ✗', m); } };

/* ① O export não existe mais — por nome, no arquivo onde morava. */
const idx = fs.readFileSync(path.join(RAIZ, 'functions/index.js'), 'utf8');
APOSENTADAS.forEach((nome) => {
  ok(!new RegExp('^exports\\.' + nome + '\\s*=', 'm').test(idx),
    nome + ': não existe mais como export em functions/index.js');
});

/* ② E o arquivo continua VÁLIDO. Remover bloco de arquivo de 12 mil linhas é onde se deixa chave
 * solta — e `node --check` é o único que vê isso antes do deploy.
 * [[feedback_crase_em_template_literal_derruba_a_tela]] */
try {
  execFileSync(process.execPath, ['--check', path.join(RAIZ, 'functions/index.js')], { stdio: 'pipe' });
  ok(true, 'functions/index.js continua sintaticamente válido depois da remoção');
} catch (e) {
  ok(false, 'functions/index.js QUEBROU: ' + String((e && e.stderr) || e).slice(0, 300));
}

/* ③ Nenhum CLIENTE as chama — nem a web, nem o pacote embarcado dos dois nativos.
 * ⛔ Varredura recursiva de verdade: `js/` é onde o app vive, e `ios/`/`android/` carregam a CÓPIA
 * embarcada, que é o que roda no aparelho. Olhar só `js/` deixaria o irmão.
 * [[feedback_enumerar_todos_os_caminhos_antes_de_dar_por_pronto]] */
const IGNORAR = new Set(['node_modules', '.git', 'build', 'Pods', 'DerivedData', '.gradle']);
function varrer(dir, achados) {
  let entradas = [];
  try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return achados; }
  entradas.forEach((e) => {
    if (IGNORAR.has(e.name)) return;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { varrer(p, achados); return; }
    if (!/\.(js|ts|html|json)$/.test(e.name)) return;
    let txt = '';
    try { txt = fs.readFileSync(p, 'utf8'); } catch (err) { return; }
    APOSENTADAS.forEach((nome) => {
      /* ⚠️ Só conta como chamada quando o nome aparece dentro de uma INVOCAÇÃO. Os testes L7
       * mencionam os nomes justamente para provar que o cliente NÃO os chama — proibir a menção
       * derrubaria quem está do nosso lado. */
      if (new RegExp("httpsCallable\\(\\s*['\"]" + nome + "['\"]").test(txt)
        || new RegExp("_callFn\\(\\s*['\"]" + nome + "['\"]").test(txt)) {
        achados.push(path.relative(RAIZ, p) + ' → ' + nome);
      }
    });
  });
  return achados;
}
const chamadas = ['js', 'ios', 'android'].reduce((acc, d) => varrer(path.join(RAIZ, d), acc), []);
ok(chamadas.length === 0, 'nenhum cliente (web, iOS embarcado, Android embarcado) chama as duas'
  + (chamadas.length ? ' — achou: ' + JSON.stringify(chamadas) : ''));

/* ④ Nenhum script de deploy as nomeia: deploy que pede função inexistente falha na hora errada. */
const alvosDeDeploy = [];
['scripts', '.github'].forEach((d) => {
  const base = path.join(RAIZ, d);
  const achar = (dir) => {
    let entradas = [];
    try { entradas = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    entradas.forEach((e) => {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { achar(p); return; }
      if (!/\.(sh|js|ya?ml)$/.test(e.name)) return;
      let txt = '';
      try { txt = fs.readFileSync(p, 'utf8'); } catch (err) { return; }
      APOSENTADAS.forEach((nome) => {
        if (txt.indexOf(nome) !== -1) alvosDeDeploy.push(path.relative(RAIZ, p) + ' → ' + nome);
      });
    });
  };
  achar(base);
});
ok(alvosDeDeploy.length === 0, 'nenhum script de deploy nomeia as portas aposentadas'
  + (alvosDeDeploy.length ? ' — achou: ' + JSON.stringify(alvosDeDeploy) : ''));

if (fail) { console.error('\n❌ portas-aposentadas: ' + pass + ' ok, ' + fail + ' falharam'); process.exit(1); }
console.log('\n✅ portas-aposentadas: ' + pass + ' ok');

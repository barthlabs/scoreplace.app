/* CRASE DENTRO DE TEMPLATE LITERAL DERRUBA A TELA — e o `node --check` NÃO pega.
 *
 * Incidente de 14/ago/2026 (1.8.72, produção): "voltou a merda da tela preta sem
 * renderizar porra nenhuma". Causa: num comentário HTML DENTRO do template
 * literal do hero da dashboard eu escrevi o nome de uma classe entre CRASES
 * (`.sp-name-fit`). Crase FECHA o template — o texto entre elas virou CÓDIGO e o
 * resto virou outro template. O arquivo continuou passando no `node --check`
 * (ficou sintaticamente válido por acaso) e explodiu em RUNTIME:
 * `ReferenceError: name is not defined` → renderDashboard morre → tela preta.
 *
 * ⚠️ POR QUE PASSOU PELA MINHA VERIFICAÇÃO: eu conferi a saudação no navegador
 * COPIANDO o markup na mão, em vez de exercitar o caminho real do arquivo. O
 * markup copiado estava certo; o arquivo, não. Verificação que não passa pelo
 * código real não é verificação.
 *
 * Esta suíte trava as DUAS pontas:
 *   (1) a CLASSE — nenhum comentário HTML dentro de js/ pode conter crase;
 *   (2) o CASO — o template do hero da dashboard é avaliado de verdade e tem
 *       que produzir HTML com a saudação e o nome.
 *
 * Mesma família do `<script>` sem fechamento (v0.16.11) e do regex DOTALL que
 * corrompeu o plist: erro que o validador de sintaxe não vê.
 *
 * Rodado por: npm test (tests/run-unit.js)
 */
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── template-literal-nao-quebra ────');

const ROOT = path.join(__dirname, '..');

// ── (1) A CLASSE: comentário HTML com crase em qualquer .js ────────────────
function todosOsJs(dir, out) {
  out = out || [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) todosOsJs(p, out);
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}
const arquivos = todosOsJs(path.join(ROOT, 'js'));
ok(arquivos.length > 30, 'varredura alcançou os arquivos de js/ (' + arquivos.length + ')');

const suspeitos = [];
for (const f of arquivos) {
  const src = fs.readFileSync(f, 'utf8');
  const re = /<!--[\s\S]*?-->/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[0].indexOf('`') !== -1) {
      suspeitos.push(path.relative(ROOT, f) + ':' + src.slice(0, m.index).split('\n').length);
    }
  }
}
ok(suspeitos.length === 0,
   '🔒 nenhum comentário HTML em js/ contém CRASE — dentro de template literal ela fecha a string e o texto vira código · achados: ' + suspeitos.join(', '));

// ── (2) O CASO: o template do hero da dashboard é AVALIADO ────────────────
// Não basta a varredura: ela pega a forma conhecida. Aqui o bloco real do
// arquivo é executado como template, e tem que produzir a saudação e o nome.
const DASH = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
const marca = DASH.indexOf('a saudação sai da linha do NOME');
ok(marca !== -1, 'bloco do hero localizado no dashboard.js');
const janela = DASH.slice(marca - 500, marca + 1600);
const ini = janela.indexOf('<div style="flex:1');
const fim = janela.indexOf('</div>', janela.indexOf('</h2>')) + 6;
ok(ini !== -1 && fim > ini, 'trecho do hero recortado por marcadores');
const trecho = janela.slice(ini, fim);

let html = null, erro = null;
try {
  html = new Function('_t', '_proBadge', 'userName', 'window',
    'return `' + trecho + '`;'
  )((k, v) => (k.indexOf('Greeting') !== -1 ? v.greeting + ',' : v.name + '!'),
    '', 'Rodrigo',
    { _welcomeWord: () => 'Bem-vindo', _firstNameOnly: (n) => n });
} catch (e) { erro = e; }

ok(!erro, '🔒 o template do hero AVALIA sem explodir' + (erro ? ' — ' + erro.constructor.name + ': ' + erro.message : ''));
ok(html && /Bem-vindo,/.test(html), 'o HTML gerado traz a saudação');
ok(html && /Rodrigo!/.test(html), 'o HTML gerado traz o nome');
ok(html && html.indexOf('sp-name-fit') !== -1, 'e a classe do ajuste de fonte segue no elemento do nome');
ok(html && html.length > 400, 'HTML com corpo de verdade (' + (html ? html.length : 0) + ' chars)');

// ── (3) o lembrete de que a sintaxe sozinha não prova nada ────────────────
// Um arquivo com o bug PASSA no node --check; foi assim que ele chegou em
// produção. A asserção existe pra que ninguém troque esta suíte por "mas o
// node --check está verde".
const comBug = 'var a = `texto <!-- veja `.classe` aqui --> fim`;';
let sintaxeOk = true;
try { new Function(comBug); } catch (e) { sintaxeOk = false; }
ok(sintaxeOk,
   '🔒 o padrão do incidente PASSA num validador de sintaxe — por isso a varredura acima existe');

console.log('template-literal-nao-quebra:', pass, 'ok,', fail, 'falhas');
if (fail > 0) process.exit(1);

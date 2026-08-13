/* CSS COM BLOCO ABERTO ENGOLE O RESTO DO ARQUIVO — node tests/css-nao-perde-regra.test.js
 *
 * O INCIDENTE (12/ago/2026): `css/layout.css` tinha UMA chave de fechamento a menos.
 * O bloco `html.sp-android .topbar {` foi acrescentado em `7ffcee1d` só com o seletor e a
 * propriedade — sem o `}`. A partir dali o parser engoliu **11 regras**, medidas no
 * navegador comparando o arquivo com e sem aquele caractere (26 regras × 15):
 *
 *   @media (display-mode: standalone)   ← a safe-area do PWA instalado: era ESTA que
 *                                          fazia o cabeçalho invadir relógio/ilha
 *   html.sp-native .main-content · .modal · .modal-header   ← safe-area do app nativo
 *   .page-title · .page-title h1 · .page-title svg          ← tamanho do logo
 *   .view-container
 *   @media (min-width:768px)…(1199px) · @media (max-width:767px)  ← o layout MOBILE inteiro
 *   @keyframes fadeIn
 *
 * Nada disso dá erro. O navegador não avisa, o arquivo carrega, o `node --check` não
 * enxerga CSS — e o sintoma aparece longe da causa (cabeçalho torto na landing e no app).
 * É a MESMA classe do `<script>` sem fechamento do index.html (v0.16.11), que já custou
 * um dia inteiro de diagnóstico. Instrução no CLAUDE.md apodrece; teste não.
 *
 * O balanceamento é contado IGNORANDO comentários e strings — `content: "{"` é legítimo.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const raiz = path.join(__dirname, '..');

/** Remove comentários e conteúdo de strings, pra as chaves contadas serem só as de bloco. */
function semRuido(css) {
  let out = '', i = 0;
  while (i < css.length) {
    if (css[i] === '/' && css[i + 1] === '*') {              // comentário
      const fim = css.indexOf('*/', i + 2);
      i = (fim < 0) ? css.length : fim + 2;
      continue;
    }
    if (css[i] === '"' || css[i] === "'") {                  // string
      const aspa = css[i];
      i++;
      while (i < css.length && css[i] !== aspa) { i += (css[i] === '\\') ? 2 : 1; }
      i++;
      continue;
    }
    out += css[i++];
  }
  return out;
}

function desbalanceio(css) {
  const limpo = semRuido(css);
  let prof = 0, negativo = false;
  for (const ch of limpo) {
    if (ch === '{') prof++;
    else if (ch === '}') { prof--; if (prof < 0) negativo = true; }
  }
  return { saldo: prof, fechouDemais: negativo };
}

console.log('──── CSS não perde regra por bloco aberto ────');

const arquivos = fs.readdirSync(path.join(raiz, 'css')).filter((f) => f.endsWith('.css'));
ok(arquivos.length > 0, 'achou os arquivos de CSS');

arquivos.forEach((nome) => {
  const css = fs.readFileSync(path.join(raiz, 'css', nome), 'utf8');
  const d = desbalanceio(css);
  ok(d.saldo === 0 && !d.fechouDemais,
     'css/' + nome + ' fecha todos os blocos' +
     (d.saldo !== 0 ? ' (sobrou ' + d.saldo + ' bloco(s) aberto(s) — o resto do arquivo é engolido)' : '') +
     (d.fechouDemais ? ' (fechou bloco que nunca abriu)' : ''));
});

// O <style> inline do index.html cai na mesma armadilha.
{
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  const blocos = html.match(/<style[^>]*>([\s\S]*?)<\/style>/g) || [];
  blocos.forEach((b, i) => {
    const corpo = b.replace(/^<style[^>]*>/, '').replace(/<\/style>$/, '');
    const d = desbalanceio(corpo);
    ok(d.saldo === 0 && !d.fechouDemais, 'index.html <style> #' + (i + 1) + ' fecha todos os blocos');
  });
}

// A trava irmã: <script> sem fechamento (o incidente da v0.16.11 — três tags abertas
// consumiram js/firebase-db.js, tournaments-utils.js e o registro do service worker).
{
  const html = fs.readFileSync(path.join(raiz, 'index.html'), 'utf8');
  const abre = (html.match(/<script[\s>]/g) || []).length;
  const fecha = (html.match(/<\/script>/g) || []).length;
  ok(abre === fecha,
     'index.html: <script> abertos = fechados (' + abre + '/' + fecha + ')');
}

console.log(`\n  ${pass} passaram, ${fail} falharam`);
if (fail) process.exit(1);

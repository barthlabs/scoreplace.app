/* O RUNNER PARALELO NÃO PODE MISTURAR QUEM MEXE NO REPO (leva 2.1.99)
 *
 * Ordem do dono (02/set/2026): _"faz a paralelizacao"_. Medido antes de mexer: 563 suítes
 * em série levam ~7min numa máquina de 14 núcleos usando 1 — e o deploy roda a suíte DUAS
 * vezes (preflight + hosting.predeploy), o que fazia 15min de publicação.
 *
 * ⛔ O PERIGO QUE ESTE TESTE GUARDA. Três suítes CORROMPEM arquivo do repo de propósito,
 * para provar que a trava correspondente acusa, e restauram no fim:
 *     · ext-version-single-source            → reescreve js/store.js e extension/content.js
 *     · trava-de-cache-buster-nao-fica-vazia → reescreve index.html
 *     · gate-amizade-detecta-alias           → cria js/views/__sonda-gate-amizade.js
 * `js/store.js` e `index.html` são lidos por dezenas de outras suítes (o render-harness
 * carrega o store.js). Se qualquer uma rodar AO MESMO TEMPO que essas três, vai ler o
 * arquivo quebrado e falhar ao acaso. Um gate intermitente é PIOR que um gate lento: ele
 * ensina o time a ignorar vermelho.
 *
 * ⚠️ POR QUE UM TESTE, E NÃO SÓ A LISTA: a lista não se mantém sozinha. Quem escrever
 * amanhã uma suíte que mexe em arquivo do repo e esquecer de listá-la reintroduz o
 * problema, e a falha vai aparecer como "às vezes o npm test dá vermelho" — o sintoma mais
 * caro de diagnosticar que existe. Então aqui se VARRE, não se confia.
 * (É a lição de "construí a rede e não a BUSCA": a rede sozinha já falhou aqui antes.)
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'tests', 'run-unit.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── o runner paralelo não mistura quem mexe no repo ────');

// ── a lista de suítes e a de exclusivas, lidas do próprio runner ──────────────
/* ⚠️ Lê o BLOCO `const SUITES = [ … ];`, não linhas soltas. A 1ª versão exigia a linha
 * terminando na vírgula e perdia toda entrada com comentário ao lado — inclusive as duas
 * que a execução paralela acusou. Extração que só vê o caso fácil mente sobre a cobertura. */
const blocoSuites = src.slice(src.indexOf('const SUITES = ['), src.indexOf('\n];'));
const SUITES = (blocoSuites.match(/'((?:tests|functions-autodraw)\/[^']+)'/g) || [])
  .map((x) => x.replace(/'/g, ''));
ok(SUITES.length > 400, '① o runner tem a lista de suítes (' + SUITES.length + ')');

const lista = (marca) => {
  const i = src.indexOf('const ' + marca);
  return (src.slice(i, src.indexOf('];', i)).match(/'((?:tests|functions-autodraw)\/[^']+)'/g) || [])
    .map((x) => x.replace(/'/g, ''));
};
const MEXEM_NO_REPO = lista('MEXEM_NO_REPO');
const PRENDEM_PORTA = lista('PRENDEM_PORTA');
const EXCLUSIVAS = MEXEM_NO_REPO.concat(PRENDEM_PORTA);
ok(MEXEM_NO_REPO.length >= 3, '① a lista de quem mexe no repo (' + MEXEM_NO_REPO.length + ')');
ok(PRENDEM_PORTA.length >= 2,
   '① e a de quem PRENDE PORTA de emulador (' + PRENDEM_PORTA.length + ') — duas na mesma porta não coexistem');

/* ── ② A VARREDURA: quem ESCREVE em caminho derivado do repo? ─────────────────
 * Duas armadilhas que a primeira versão desta varredura caiu, e que estão consertadas
 * aqui porque cada uma produz o erro mais caro possível — silêncio:
 *
 *  · O CAMINHO QUASE NUNCA ESTÁ NA LINHA DA ESCRITA. As suítes reais fazem
 *    `const idx = path.join(ROOT, 'index.html')` lá em cima e `writeFileSync(idx, …)`
 *    lá embaixo. Uma varredura linha-a-linha não vê e passa VERDE — que é justamente o
 *    resultado inútil. Então primeiro se colhem as variáveis derivadas do repo.
 *  · `copyFileSync(origem, destino)` — quem importa é o DESTINO. Ler o repo e escrever
 *    num `mkdtemp` é o padrão CERTO (é o que `versao-nativa-e-a-da-web` faz), e acusá-lo
 *    ensinaria a ignorar este teste.
 *
 * Sandbox própria (`os.tmpdir()`/`mkdtempSync`) nunca conta: não colide com ninguém. */
const DESTINO_2o = ['copyFileSync', 'renameSync', 'cpSync', 'symlinkSync', 'linkSync'];
const suspeitas = [];
SUITES.forEach((rel) => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return;
  /* ⚠️ SEM COMENTÁRIOS. A 1ª versão desta varredura acusou ESTE PRÓPRIO ARQUIVO: o
   * exemplo `writeFileSync(idx, …)` que explica a armadilha mora num comentário aqui em
   * cima. Varredura que lê comentário mede o texto, não o código. */
  const t = fs.readFileSync(abs, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  // variáveis que apontam pra dentro do repo (e não pra um tmp)
  const doRepo = {};
  const re = /(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\n]+)/g;
  let m;
  while ((m = re.exec(t))) {
    const nome = m[1], valor = m[2];
    if (/tmpdir|mkdtemp/i.test(valor)) continue;
    if (/\b(ROOT|root|RAIZ)\b/.test(valor) || /__dirname\s*,\s*'\.\.'/.test(valor)) doRepo[nome] = true;
    else if (Object.keys(doRepo).some((k) => new RegExp('\\b' + k + '\\b').test(valor))) doRepo[nome] = true;
  }

  const linhas = t.split('\n');
  linhas.forEach((ln, i) => {
    const mm = ln.match(/\b(writeFileSync|mkdirSync|rmSync|unlinkSync|appendFileSync|copyFileSync|renameSync|cpSync|symlinkSync|linkSync)\s*\(/);
    if (!mm) return;
    const fn = mm[1];
    const depois = ln.slice(ln.indexOf(mm[0]) + mm[0].length);
    const args = depois.split(',');
    const alvo = (DESTINO_2o.indexOf(fn) !== -1) ? (args[1] || depois) : args[0];
    if (/tmpdir|mkdtemp/i.test(alvo)) return;
    const bate = /\b(ROOT|root|RAIZ)\b/.test(alvo) ||
                 Object.keys(doRepo).some((k) => new RegExp('\\b' + k + '\\b').test(alvo));
    if (bate) suspeitas.push({ rel: rel, linha: i + 1, trecho: ln.trim().slice(0, 90) });
  });
});

const foraDaLista = suspeitas.filter((s) => EXCLUSIVAS.indexOf(s.rel) === -1);
const nomes = Array.from(new Set(foraDaLista.map((s) => s.rel)));
if (nomes.length) {
  console.error('  ↳ escrevem em caminho do REPO e NÃO estão em EXCLUSIVAS:');
  foraDaLista.slice(0, 8).forEach((s) => console.error('      ' + s.rel + ':' + s.linha + '  ' + s.trecho));
}
ok(nomes.length === 0,
   '② ⭐ toda suíte que escreve em arquivo do repo está em EXCLUSIVAS (achei ' + nomes.length + ' fora)');

// ── ③ e a lista não pode ter entrada morta (suíte que saiu do catálogo) ──────
const orfas = EXCLUSIVAS.filter((r) => SUITES.indexOf(r) === -1);
ok(orfas.length === 0, '③ nenhuma exclusiva órfã (fora do catálogo): ' + orfas.join(', '));
const semEscrita = MEXEM_NO_REPO.filter((r) => !suspeitas.some((s) => s.rel === r));
ok(semEscrita.length === 0,
   '③ e nenhuma de MEXEM_NO_REPO que já não escreve mais (decoy): ' + semEscrita.join(', '));

// ── ④ o desenho de 3 fases continua no runner ────────────────────────────────
ok(/await pool\(exclusivas, 1\)/.test(src),
   '④ ⭐ as exclusivas rodam com paralelismo 1 — sozinhas, é o ponto todo');
ok(src.indexOf('await pool(exclusivas, 1)') < src.indexOf('await pool(leves'),
   '④ e ANTES do resto, pra o resto rodar contra árvore intacta');
ok(/JOBS_PESADAS/.test(src) && /puppeteer\|playwright\|chromium/.test(src),
   '④ as suítes com Chromium têm pool próprio, mais curto');
ok(/SP_TEST_JOBS/.test(src), '④ existe a saída SP_TEST_JOBS=1 pra voltar ao serial puro');
/* ⚠️ olha a CHAMADA, não o texto: a primeira versão desta asserção casava com o próprio
 * comentário do runner que explica por que `inherit` não serve — e falhava sozinha. */
const semComentarios = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(!/spawn\([^)]*stdio/.test(semComentarios) && !/stdio: *'inherit'/.test(semComentarios),
   '④ a saída é BUFFERIZADA por suíte — `inherit` em paralelo entrelaça 8 suítes e some com o erro');

// ── ⑤ o contrato de saída que outros scripts leem não mudou ─────────────────
ok(/TODAS as ' \+ SUITES\.length \+ ' suítes unitárias passaram/.test(src),
   '⑤ a linha de sucesso continua idêntica (o deploy e outras suítes leem ela)');
ok(/process\.exit\(failed\.length \? 1 : 0\)/.test(src), '⑤ e o exit code segue o mesmo contrato');
ok(/──────────── ' \+ rel \+ ' ────────────/.test(src), '⑤ cada suíte segue anunciando o nome antes da saída');

console.log(fail ? ('  ' + fail + ' FALHA(S), ' + pass + ' ok') : ('  ✓ ' + pass + ' asserções'));
process.exit(fail ? 1 : 0);

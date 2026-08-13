/* "COLOQUE TAMBÉM O SOBRENOME" + a raridade do token que faz o nome de 1 palavra virar sinal.
 *
 * CASO REAL (Confra, 12/ago/2026): "Betânia" e "maria betania roberto faria" são a MESMA
 * pessoa, com duas contas, jogando em DOIS grupos da mesma rodada (K e P). Ninguém pegou.
 *
 * POR QUE NÃO PEGOU — duas coisas, e as duas foram medidas:
 *  1. O comparador exigia 2+ tokens no nome menor (MIN_TOKENS_SUBCONJUNTO), porque
 *     subconjunto de 1 token dava "Fabio" × "Fábio Simão" e "Marco" × "Adriana de Marco".
 *  2. Mesmo que aceitasse, a BUSCA nunca entregaria o candidato: `displayName_keys` guarda
 *     o nome inteiro concatenado e `_firstkey`/`_lastkey` são as pontas — nada alcança um
 *     token do MEIO ("maria BETANIA roberto faria").
 *
 * O QUE ENTROU:
 *  • `displayName_tokens` (array indexado) — acha o candidato e permite CONTAR a raridade.
 *  • Exceção de 1 token no comparador, com DUAS guardas: o token existe só nas 2 contas
 *    comparadas (raridade) E não é o sobrenome do nome maior.
 *  • Aviso no perfil sugerindo sobrenome pra quem tem um nome só (34 de 217 contas).
 *
 * Este teste trava as três pontas, incluindo a PARIDADE entre o helper do cliente (que
 * decide o aviso) e o `tokensNome` do servidor (que decide identidade) — se divergirem, o
 * app avisa uma coisa e o servidor enxerga outra.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const ROOT = path.join(__dirname, '..');
const dup = require(path.join(ROOT, 'functions', 'duplicate-person-core.js'));
const authSrc = fs.readFileSync(path.join(ROOT, 'js', 'views', 'auth.js'), 'utf8');
const storeSrc = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const cfSrc = fs.readFileSync(path.join(ROOT, 'functions', 'index.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── sobrenome sugerido + raridade do token ────');

// ── 1. O helper do cliente, extraído do store.js REAL ──────────────────────────────────
const m = /window\._nomeSoTemPrimeiroNome = function[\s\S]*?\n\};/.exec(storeSrc);
ok(!!m, 'window._nomeSoTemPrimeiroNome tem que existir em js/store.js');
let soPrimeiro = null;
if (m) {
  const sb = { window: {} }; sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(m[0], sb, { filename: 'helper.js' });
  soPrimeiro = sb.window._nomeSoTemPrimeiroNome;
}

// ── 2. PARIDADE cliente × servidor ─────────────────────────────────────────────────────
// O aviso do perfil e a detecção de duplicata têm que enxergar o MESMO nome do mesmo jeito.
if (soPrimeiro) {
  const nomes = [
    'Betânia', 'Maria Betânia Roberto Faria', 'maria betania roberto faria',
    'Adriana de Marco', 'Marco', 'Fabio', 'Fábio Simão', 'M.Delia Fernandez',
    'Mariana C', 'danielacsimao', 'Vivi Hirata', 'RB', 'Toninho',
    '+5511930038956', '   ', '', 'Ana  Paula', "O'Brien", 'Jean-Pierre Dupont',
  ];
  let divergiu = 0;
  nomes.forEach((n) => {
    const cli = soPrimeiro(n);
    const srv = dup.tokensNome(n).length === 1;
    if (cli !== srv) { divergiu++; console.error('    divergiu em', JSON.stringify(n), 'cliente', cli, '× servidor', srv); }
  });
  ok(divergiu === 0, 'cliente e servidor têm que concordar em TODOS os nomes — divergiram em ' + divergiu);

  // casos que o aviso precisa acertar, explicitamente
  ok(soPrimeiro('Betânia') === true, '"Betânia" é nome de um token só → sugere sobrenome');
  ok(soPrimeiro('Maria Betânia Roberto Faria') === false, 'nome completo não sugere nada');
  ok(soPrimeiro('Adriana de Marco') === false, 'partícula conta como token (igual ao servidor)');
  ok(soPrimeiro('') === false, 'nome vazio não dispara o aviso (é outro nudge)');
}

// ── 3. O aviso está fiado no perfil ────────────────────────────────────────────────────
ok(/_nomeSoTemPrimeiroNome\s*&&\s*window\._nomeSoTemPrimeiroNome\(/.test(authSrc),
   'o perfil tem que consultar o helper (com guarda, pra não quebrar se o store não subiu)');
ok(/sobrenome/i.test(authSrc.slice(authSrc.indexOf('_nomeSoTemPrimeiroNome'))),
   'o texto do aviso fala em sobrenome');

// ── 4. A raridade está fiada na CF, nos DOIS caminhos, por UM helper só ────────────────
ok((cfSrc.match(/_freqDosTokensSoltos/g) || []).length === 3,
   'o helper de raridade é único: 1 definição + os 2 caminhos de detecção (cadastro e inscrição)');
ok(/displayName_tokens/.test(cfSrc), 'a CF usa o índice displayName_tokens');
ok(/displayName_tokens:\s*tEsperado/.test(cfSrc),
   'o índice é mantido pelo trigger que já cura as outras chaves (senão nasce stale)');
ok((cfSrc.match(/where\("displayName_tokens", "array-contains"/g) || []).length >= 3,
   'busca por token nos 2 caminhos + a contagem de raridade');

// ── 5. A regra em si (o núcleo, com os pares REAIS da base) ────────────────────────────
const cmp = (a, b, f) => dup.compararNomes(a, b, f == null ? undefined : { freqTokens: f });
ok(cmp('Betânia', 'maria betania roberto faria', { betania: 2 }) === 'subconjunto',
   'o caso da Betânia casa quando o token é raro');
ok(cmp('Marco', 'Adriana de Marco', { marco: 2 }) === null,
   'Marco NÃO casa: o token é o sobrenome dela (raridade sozinha deixaria passar)');
ok(cmp('Fabio', 'Fábio Simão', { fabio: 4 }) === null,
   'Fabio NÃO casa: token comum');
ok(cmp('Betânia', 'maria betania roberto faria') === null,
   'sem o mapa de frequência nada muda — a exceção é opt-in');
// o mapa é POR TOKEN: a raridade de um par não pode liberar outro par do mesmo lote
ok(cmp('Fabio', 'Fábio Simão', { betania: 2 }) === null,
   'frequência de OUTRO token não libera este par (é mapa, não valor solto)');

console.log(fail === 0 ? '  ✓ ' + pass + ' asserções' : '  ' + pass + ' ok / ' + fail + ' falhas');
process.exit(fail === 0 ? 0 : 1);

'use strict';
/* ⛔⛔ UMA PORTA PARA "SOU ORGANIZADOR DESTE TORNEIO?" (ordem do dono, 24/set/2026).
 *
 * _"corrija essa tecnica para que seja a melhor tecnica em programacao"_ — e ele estava certo
 * de que havia algo ridículo, embora não fosse o que eu tinha descrito.
 *
 * O que era ruim, medido: 38 lugares nas telas repetiam à mão a MESMA guarda antes de fazer a
 * pergunta, e UM deles chamava por APELIDO (`store.isOrganizer`), escapando de qualquer busca
 * pelo nome do objeto. Agora existe uma casca — `window._souOrganizador(t)` — e a regra
 * continua onde sempre esteve.
 *
 * ⛔ ESTE PORTÃO OLHA A ÁRVORE, não o texto: apelido, encadeamento opcional, acesso por
 * string, desestruturação e `bind` recriam a porta externa SEM escrever `.isOrganizer(`.
 * Foi um apelido que furou as minhas duas primeiras contagens.
 */
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');
const ROOT = path.join(__dirname, '..');

let fail = 0, pass = 0;
function ok(cond, msg) { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.error('  ✗ ' + msg); } }

console.log('──── uma porta para o papel no torneio ────');

/* Acessos ao método `isOrganizer` que CRIAM uma porta: chamada (inclusive `?.()`), extração
 * como valor de função, desestruturação e `bind`. ⛔ LEITURA DE CAMPO não conta: existe
 * `isOrganizer` como campo de destinatário no relatório de comunicação — dado, não porta. Um
 * portão que reprovasse isso reclamaria do código certo, e portão assim acaba desligado. */
function portasExternas(fonte) {
  const achados = [];
  let raiz;
  try {
    raiz = acorn.parse(fonte, { ecmaVersion: 'latest', sourceType: 'script',
      allowReturnOutsideFunction: true, allowAwaitOutsideFunction: true, allowHashBang: true });
  } catch (e) { return [{ motivo: 'não parseou: ' + e.message }]; }

  const ehMembroIsOrganizer = (n) => n && (n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression')
    && ((!n.computed && n.property && n.property.name === 'isOrganizer')
      || (n.computed && n.property && n.property.type === 'Literal' && n.property.value === 'isOrganizer'));

  const anda = (n, pai) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach((x) => anda(x, pai)); return; }
    if (!n.type) return;

    if (ehMembroIsOrganizer(n)) {
      const p = pai || {};
      const ehChamada = (p.type === 'CallExpression' || p.type === 'OptionalCallExpression') && p.callee === n;
      const ehBind = (p.type === 'MemberExpression' && p.object === n
        && p.property && (p.property.name === 'bind' || p.property.name === 'call' || p.property.name === 'apply'));
      const ehExtracao = (p.type === 'VariableDeclarator' && p.init === n)
        || (p.type === 'AssignmentExpression' && p.right === n)
        || (p.type === 'Property' && p.value === n && !p.shorthand)
        || ((p.type === 'CallExpression' || p.type === 'OptionalCallExpression') && (p.arguments || []).indexOf(n) !== -1);
      if (ehChamada || ehBind || ehExtracao) achados.push({ motivo: n.type + ' usado como função' });
    }
    /* Desestruturação: `const { isOrganizer: f } = store` — o nome sai do objeto sem
     * MemberExpression nenhuma, e viraria uma porta igual. */
    if (n.type === 'ObjectPattern') {
      (n.properties || []).forEach((pr) => {
        if (pr && pr.key && (pr.key.name === 'isOrganizer' || pr.key.value === 'isOrganizer')) {
          achados.push({ motivo: 'desestruturação de isOrganizer' });
        }
      });
    }
    Object.keys(n).forEach((k) => {
      if (k === 'type' || k === 'start' || k === 'end' || k === 'loc') return;
      anda(n[k], n);
    });
  };
  anda(raiz, null);
  return achados;
}

// ── A. as SEIS formas de escapar REPROVAM ────────────────────────────────────
{
  const casos = {
    'apelido':                 'store.isOrganizer(t);',
    'chamada opcional':        'store.isOrganizer?.(t);',
    'receptor opcional':       'store?.isOrganizer(t);',
    'acesso por string':       "store['isOrganizer'](t);",
    'desestruturação':         'const { isOrganizer: f } = store;',
    'bind':                    'var g = store.isOrganizer.bind(store);'
  };
  Object.keys(casos).forEach((nome) => {
    ok(portasExternas(casos[nome]).length > 0, 'reprova ' + nome);
  });
}

// ── B. o que é LEGÍTIMO passa ────────────────────────────────────────────────
{
  ok(portasExternas('if (r.isOrganizer) { x(); }').length === 0,
    'leitura de CAMPO passa — é dado do relatório, não porta');
  ok(portasExternas('var o = { isOrganizer: true };').length === 0,
    'campo em objeto literal passa');
  ok(portasExternas('// store.isOrganizer(t) explicado aqui\nvar a = 1;').length === 0,
    'comentário citando o nome passa — senão a anotação derruba o portão');
  ok(portasExternas('window._souOrganizador(t);').length === 0, 'a porta nova passa');
}

// ── C. A ÁRVORE REAL: nenhuma porta externa sobrou ───────────────────────────
{
  const arquivos = fs.readdirSync(path.join(ROOT, 'js')).filter((f) => f.endsWith('.js')).map((f) => 'js/' + f)
    .concat(fs.readdirSync(path.join(ROOT, 'js/views')).filter((f) => f.endsWith('.js')).map((f) => 'js/views/' + f));
  const sujos = [];
  arquivos.forEach((rel) => {
    if (rel === 'js/store.js') return;   // a casa: chamar a regra de dentro é o normal
    const achados = portasExternas(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
    if (achados.length) sujos.push(rel + ' (' + achados.map((a) => a.motivo).join('; ') + ')');
  });
  ok(sujos.length === 0, 'nenhum arquivo fora da casa chama a regra direto'
    + (sujos.length ? '\n      ' + sujos.join('\n      ') : ''));
}

// ── D. a porta é CASCA, e a regra não se repete nela ─────────────────────────
{
  const store = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  const i = store.indexOf('window._souOrganizador = function');
  ok(i > 0, 'a porta existe');
  const corpo = store.slice(i, store.indexOf('};', i) + 2);
  ok(/AppStore\.isOrganizer\(t\)/.test(corpo), 'ela DELEGA na regra canônica');
  ok(!/creatorUid|coHosts|sandbox/i.test(corpo),
    '⛔ e NÃO reimplementa a regra — duas implementações da mesma pergunta já quebraram este app');
  ok(/^ *return !!\(/m.test(corpo), 'devolve booleano sempre');
}

// ── E. `isOrg` não significa mais "modo de visão" ────────────────────────────
{
  const store = fs.readFileSync(path.join(ROOT, 'js/store.js'), 'utf8');
  const linhas = store.split('\n').filter((l) => /viewMode\s*===\s*'organizer'/.test(l) && !/^\s*[/*]/.test(l));
  ok(linhas.length > 0, 'o modo de visão continua sendo decidido');
  ok(linhas.every((l) => !/\bisOrg\b/.test(l)),
    '⛔ e NÃO se chama mais `isOrg` — nome igual para pergunta diferente é como permissão vaza');
  const i = store.indexOf('souVisaoOrganizador');
  ok(i > 0, 'o nome novo diz que ali é modo de VISÃO');
  /* ⛔ Recorte pela FUNÇÃO que desenha o rótulo, não por tamanho fixo em volta do nome — é a
   * trava `teste-nao-recorta-por-tamanho-fixo`, e ela me pegou aqui mesmo. */
  const iFn = store.lastIndexOf('function _setViewModeLabel', i);
  let nivel = 0, fim = -1;
  for (let k = store.indexOf('{', iFn); k < store.length; k++) {
    if (store[k] === '{') nivel++;
    else if (store[k] === '}') { nivel--; if (nivel === 0) { fim = k; break; } }
  }
  const rotulo = store.slice(iFn, fim + 1);
  ok(iFn > 0 && fim > iFn, 'a função do rótulo foi recortada por casamento de chaves');
  ok(/Organizador/.test(rotulo) && /Participante/.test(rotulo) && /souVisaoOrganizador/.test(rotulo),
    'e os dois rótulos do menu continuam saindo dela, pelo nome novo');
}

// ── F. os quatro pontos que perderam o `|| isCreator` ────────────────────────
{
  ['js/views/opinion-poll.js', 'js/views/schedule-poll.js', 'js/views/wo-claim.js'].forEach((rel) => {
    const s = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const i = s.indexOf('function _isOrg(t)');
    const corpo = s.slice(i, i + 120);
    ok(/_souOrganizador\(t\)/.test(corpo) && !/isCreator/.test(corpo),
      rel.split('/').pop() + ': pergunta pela porta, sem a segunda resposta');
  });
  const arb = fs.readFileSync(path.join(ROOT, 'js/views/arbitros.js'), 'utf8');
  ok(/var isOrg = window\._souOrganizador\(t\);/.test(arb),
    'árbitros: a queda escrita à mão saiu');
  ok(/acesso a esta tela é NEGADO/.test(arb),
    '⛔ e está anotado que, sem a porta, o acesso é NEGADO — é o lado certo do erro');
}

// ── G. a outra pergunta continua existindo, e é OUTRA ────────────────────────
{
  const bu = fs.readFileSync(path.join(ROOT, 'js/views/bracket-ui.js'), 'utf8');
  ok(/function _isUserOrgOrCoHost\(t, user\)/.test(bu),
    'a pergunta sobre OUTRO usuário continua tendo função própria');
  /* ⛔ A asserção NÃO pode ser "o texto antigo não aparece": a correção CITA o texto antigo
   * para explicar o que enganou. Quem prova é a afirmação nova, que diz o que o código faz. */
  ok(/NÃO HÁ MAIS QUEDA POR E-MAIL AQUI/.test(bu),
    '⛔ e o comentário que descrevia uma queda por e-mail INEXISTENTE foi corrigido — ele me enganou');
  const iCab = bu.indexOf('NÃO HÁ MAIS QUEDA POR E-MAIL AQUI');
  ok(iCab < bu.indexOf('function _isUserOrgOrCoHost') + 3000 && iCab > 0,
    'e a correção está COLADA na função, não perdida no arquivo');
}

console.log(fail ? `❌ porta-unica-do-papel: ${fail} falha(s), ${pass} ok`
                 : `✅ porta-unica-do-papel: ${pass} ok`);
process.exit(fail ? 1 : 0);

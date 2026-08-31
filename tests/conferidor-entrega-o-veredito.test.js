/* O CONFERIDOR ENTREGA O VEREDITO ANTES DE ENCERRAR
 * node tests/conferidor-entrega-o-veredito.test.js
 *
 * O QUE ACONTECEU. O Codex rodou `node scripts/conferir-espelho-resultados.js --detalhe`
 * DUAS vezes e recebeu SAÍDA VAZIA. Exit code sem texto nenhum é o pior desfecho possível
 * para uma auditoria — indistinguível de "rodou e não achou nada", e impossível de conferir.
 *
 * A causa estrutural, e o motivo de esta suíte existir: o script terminava em
 * `process.exit()`. Quando o stdout é um PIPE — que é como QUALQUER ferramenta de CI captura
 * um processo — a escrita no Node é assíncrona, e `process.exit()` derruba o processo antes
 * de o buffer esvaziar. O veredito existe e não chega a ninguém. Agora ele usa
 * `process.exitCode` e deixa o processo terminar sozinho, depois do flush.
 *
 * ⛔ POR QUE ESTE TESTE PRECISA DE SUBPROCESSO. Chamar as funções por dentro provaria a
 * lógica e NÃO provaria a entrega: o defeito era exatamente na fronteira processo↔pipe.
 * Aqui o script REAL é executado com `spawnSync`, stdout e stderr capturados por pipe — a
 * mesma condição em que ele falhou.
 *
 * ⛔ E SEM REDE. `tests/_stub-firestore-http.js` entra por `--require` (roda ANTES do script)
 * e troca `node:https` e o `execSync` do gcloud. O conferidor não sabe que está em teste, e
 * nenhuma variável de ambiente nova foi aberta nele — abrir "aponte para outro servidor" num
 * script de auditoria seria pior que não testá-lo.
 *
 * O espelho esperado é construído com o NÚCLEO REAL (`functions/match-roster.js`), não à mão:
 * se o critério de comparação mudar, o caso de sucesso quebra sozinho.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const SCRIPT = path.join(RAIZ, 'scripts', 'conferir-espelho-resultados.js');
const STUB = path.join(__dirname, '_stub-firestore-http.js');
const Roster = require(path.join(RAIZ, 'functions', 'match-roster.js'));

let pass = 0, fail = 0;
function ok(c, m) { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } }

/* ── Firestore REST fala em `fields`; o conferidor desserializa com fromF ─────── */
function toF(x) {
  if (x === null || x === undefined) return { nullValue: null };
  if (typeof x === 'boolean') return { booleanValue: x };
  if (typeof x === 'number') return Number.isInteger(x) ? { integerValue: String(x) } : { doubleValue: x };
  if (typeof x === 'string') return { stringValue: x };
  if (Array.isArray(x)) return { arrayValue: { values: x.map(toF) } };
  const f = {}; for (const [k, v] of Object.entries(x)) f[k] = toF(v);
  return { mapValue: { fields: f } };
}
const doc = (nome, obj) => { const f = {}; for (const [k, v] of Object.entries(obj)) f[k] = toF(v); return { name: nome, fields: f }; };
const lista = (docs) => JSON.stringify({ documents: docs });

/* ── O torneio de prova: INTEIRO (sem `_semPesados`), pra o caminho não depender da
 *    montagem de subcoleção — o que se está provando aqui é a ENTREGA do veredito. ── */
const TID = 'tour_prova';
const JOGO = {
  id: 'm1', label: 'R1 Grupo A • Jogo 1', p1: 'Ana / Bia', p2: 'Cid / Dan',
  team1Uids: ['u1', 'u2'], team2Uids: ['u3', 'u4'],
  scoreP1: 6, scoreP2: 3, winner: 'Ana / Bia'
};
const TORNEIO = { id: TID, name: 'Torneio de Prova', rounds: [{ matches: [JOGO] }] };
const ESPERADO = Roster.buildSeedDoc(TORNEIO, JOGO);   // ⭐ núcleo REAL

function rodar(cenario, env) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-veredito-'));
  const arq = path.join(tmp, 'cenario.json');
  const metodos = path.join(tmp, 'metodos.txt');
  fs.writeFileSync(arq, JSON.stringify(cenario));
  const r = spawnSync(process.execPath, ['--require', STUB, SCRIPT, '--detalhe'], {
    cwd: RAIZ, encoding: 'utf8',
    env: Object.assign({}, process.env, {
      SP_STUB_CENARIO: arq, SP_STUB_METODOS: metodos,
      SP_FETCH_TENTATIVAS: '2', SP_FETCH_ESPERA_MS: '1'
    }, env || {})
  });
  r.metodos = fs.existsSync(metodos) ? fs.readFileSync(metodos, 'utf8').trim().split('\n').filter(Boolean) : [];
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
  return r;
}

const ROTAS_OK = [
  { contem: '/documents/tournaments?', body: lista([doc('p/d/documents/tournaments/' + TID, { id: TID, name: 'Torneio de Prova' })]), status: 200 },
  { contem: '/tournaments/' + TID + '/results', body: lista([doc('p/d/documents/tournaments/' + TID + '/results/m1', ESPERADO)]), status: 200 }
];

console.log('\n① sucesso: os quatro contadores E o veredito chegam ao stdout\n');
{
  /* ⚠️ O torneio inteiro vem na LISTAGEM; o conferidor lê os jogos do próprio doc. */
  const rotas = [
    { contem: '/documents/tournaments?', status: 200,
      body: lista([doc('p/d/documents/tournaments/' + TID, { id: TID, name: 'Torneio de Prova', rounds: [{ matches: [JOGO] }] })]) },
    ROTAS_OK[1]
  ];
  const r = rodar({ rotas: rotas });
  const out = r.stdout || '';
  ok(out.length > 0, '⭐ stdout NÃO veio vazio (' + out.length + ' bytes) — era este o defeito');
  ok(/torneios conferidos:\s*1/.test(out), 'contador 1/4 · torneios conferidos: 1');
  ok(/com jogos canônicos\s*:\s*1/.test(out), 'contador 2/4 · com jogos canônicos: 1');
  ok(/jogos canônicos\s*:\s*1/.test(out), 'contador 3/4 · jogos canônicos: 1');
  ok(/results ausentes\s*:\s*0/.test(out), 'contador 4/4 · results ausentes: 0');
  ok(/results divergentes\s*:\s*0/.test(out), 'e results divergentes: 0');
  ok(/✅ cada jogo canônico possui results com assinatura compatível/.test(out), '⭐ o VEREDITO está no stdout');
  ok(r.status === 0, 'exit 0 — auditoria concluída sem divergência (obtido: ' + r.status + ')');
  ok(r.metodos.length > 0 && r.metodos.every((l) => l.startsWith('GET ')), '⛔ só GET tocou a rede (' + r.metodos.length + ' requisições)');
}

console.log('\n② divergência: contadores + veredito de divergência, exit 1\n');
{
  const rotas = [
    { contem: '/documents/tournaments?', status: 200,
      body: lista([doc('p/d/documents/tournaments/' + TID, { id: TID, name: 'Torneio de Prova', rounds: [{ matches: [JOGO] }] })]) },
    { contem: '/tournaments/' + TID + '/results', status: 200, body: lista([]) }   // espelho VAZIO
  ];
  const r = rodar({ rotas: rotas });
  const out = r.stdout || '';
  ok(/results ausentes\s*:\s*1/.test(out), 'acusa 1 result ausente');
  ok(/⛔ espelho de resultado requer decisão de correção/.test(out), 'e o veredito de divergência aparece');
  ok(/fonte matches permanece intacta/.test(out), '   dizendo que a FONTE segue intacta (não houve reparo)');
  ok(r.status === 1, 'exit 1 — divergência (obtido: ' + r.status + ')');
}

console.log('\n③ leitura inconclusiva: diagnóstico no stderr, SEM contadores\n');
{
  const r = rodar({ rotas: [], erroDeRede: 'UND_ERR_CONNECT_TIMEOUT' });
  const err = r.stderr || '';
  const out = r.stdout || '';
  ok(/AUDITORIA NÃO CONCLUÍDA/.test(err), '⭐ "AUDITORIA NÃO CONCLUÍDA" no stderr');
  ok(/nenhum contador foi produzido/.test(err), '   e diz que nenhum contador foi produzido');
  ok(/causa\s*:\s*UND_ERR_CONNECT_TIMEOUT/.test(err), '   causa nomeada');
  ok(/operação\s*:\s*listagem de todos os torneios/.test(err), '   operação LÓGICA, não só a url');
  ok(/tentativas\s*:\s*2/.test(err), '   nº de tentativas');
  ok(/NÃO diz que o espelho está certo nem errado/.test(err), '   ⭐ e recusa explicitamente virar veredito');
  ok(!/torneios conferidos:/.test(out), '⛔ o stdout NÃO traz contadores — nada com cara de sucesso');
  ok(r.status === 1, 'exit 1 — leitura inconclusiva (obtido: ' + r.status + ')');
}

console.log('\n④ credencial ausente também fala (era o caminho mais mudo)\n');
{
  const r = rodar({ rotas: [], tokenFalha: 'gcloud: command not found' });
  const err = r.stderr || '';
  ok(/AUDITORIA NÃO CONCLUÍDA/.test(err), 'falha de token também vira "AUDITORIA NÃO CONCLUÍDA"');
  ok(/obter credencial de leitura/.test(err), '   com a operação nomeada');
  ok(r.status === 1, 'exit 1 (obtido: ' + r.status + ')');
  ok((r.stdout || '').indexOf('▶ conferindo espelho') !== -1, '   e o cabeçalho já saiu antes — execução não fica muda');
}

console.log('\n⑤ o script não tem process.exit() e o critério segue intocado\n');
{
  const src = fs.readFileSync(SCRIPT, 'utf8');
  ok(!/process\.exit\(/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')),
    '⭐ nenhum `process.exit(` fora de comentário — é ele que corta o stdout em pipe');
  ok(/process\.exitCode\s*=/.test(src), 'e o código de saída é definido por process.exitCode');
  ok(/Roster\.subdocSignature\(atual\)\s*!==\s*Roster\.subdocSignature\(esperado\)/.test(src),
    'o critério de divergência não mudou');
  const ESCRITA = /method:\s*['"](POST|PUT|PATCH|DELETE)['"]|\.set\(|\.update\(|\.delete\(|\.commit\(\)|batch\(\)/;
  ok(!ESCRITA.test(src), 'e não há verbo de escrita no conferidor');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s) de ' + (pass + fail) : '✅ ' + pass + '/' + pass + ' ok') + '\n');
process.exitCode = fail ? 1 : 0;

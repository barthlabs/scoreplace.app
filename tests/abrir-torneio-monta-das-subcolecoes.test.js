/* ABRIR O TORNEIO SABE MONTAR DAS SUBCOLEÇÕES (Fase 2a)
 * node tests/abrir-torneio-monta-das-subcolecoes.test.js
 *
 * O documento do torneio tem TETO: o Firestore recusa acima de 1 MB, e o Confra já está
 * em 238 KB (os jogos são 101 KB disso). A ~4× o tamanho dele o torneio NÃO PODE SER
 * GRAVADO — não é lentidão, é recusa do banco. Tirar os jogos do documento é o que
 * remove o teto, e este é o passo que TORNA ISSO POSSÍVEL: o leitor aprende a montar.
 *
 * ⛔ AINDA NÃO MUDA NADA. Enquanto o documento carregar os jogos, é dele que eles saem.
 * A troca acontece torneio a torneio, sem release: basta o documento dizer
 * `_semPesados: ['matches']`.
 *
 * ⛔ O GATILHO É O MARCADOR, NUNCA A AUSÊNCIA — torneio recém-criado também não tem jogo,
 * e disparar por "não tem rounds" faria ele abrir vazio.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

// ── o tradutor é UM só, e os dois lados usam ─────────────────────────────────
const CANON = path.join(ROOT, 'js', 'views', 'tournament-split-core.js');
ok(fs.existsSync(CANON), 'o tradutor mora em js/views/ (fonte única, copiada pro servidor)');
const vendor = path.join(ROOT, 'functions-autodraw', 'vendor', 'tournament-split-core.js');
ok(fs.existsSync(vendor), 'e o servidor tem a cópia sincronizada (copy-vendor)');
if (fs.existsSync(CANON) && fs.existsSync(vendor)) {
  ok(fs.readFileSync(CANON, 'utf8') === fs.readFileSync(vendor, 'utf8'),
    'as duas cópias são IDÊNTICAS — divergir aqui é perder jogo na tela');
}
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
ok(idx.indexOf('js/views/tournament-split-core.js') !== -1, 'o navegador carrega o tradutor');
ok(idx.indexOf('js/views/tournament-split-core.js') < idx.indexOf('js/firebase-db.js'),
  'e ANTES do firebase-db.js, que é quem o chama');

// ── o leitor: dispara pelo MARCADOR, e sabe cair de volta ────────────────────
const db = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');
const fn = db.slice(db.indexOf('async loadTournamentById'), db.indexOf('async loadTournamentById') + 1200);
ok(/_semPesados/.test(fn), 'loadTournamentById olha o marcador `_semPesados`');
ok(/Array\.isArray\(_t\._semPesados\)/.test(fn),
  'o marcador é uma LISTA do que saiu — dá pra tirar só os jogos e deixar o resto');
ok(!/!_t\.rounds|rounds\s*===\s*undefined/.test(fn),
  'NÃO dispara por ausência de rounds (torneio novo também não tem jogo e abriria vazio)');
ok(/_montaDeSubcolecoes/.test(db), 'existe o montador');
const mont = db.slice(db.indexOf('async _montaDeSubcolecoes'), db.indexOf('async _montaDeSubcolecoes') + 1600);
ok(/remontar/.test(mont), 'e ele usa `remontar` do tradutor — não uma reimplementação');
ok(/_noteFsReads/.test(mont), 'e contabiliza as leituras (a Fase 2 troca 1 leitura por N — isso tem que ser visível)');
ok(/devolvendo o documento cru|return config/.test(mont),
  'se o tradutor faltar ou remontar falhar, devolve o documento — nunca um torneio pela metade');

// ── a volta é FIEL: é a propriedade que autoriza tudo ────────────────────────
const S = require(CANON);
const t = {
  id: 't1', name: 'X', status: 'open',
  rounds: [{ round: 1, format: 'rr', matches: [{ id: 'm1', p1: 'A', p2: 'B' }, { id: 'm2', p1: 'C', p2: 'D' }] },
           { round: 2, matches: [] }],
  matches: [{ id: 'm9', p1: 'E', p2: 'F' }],
  participants: [{ uid: 'u1' }, { uid: 'u2' }],
  history: [{ at: '1', o: 'x' }]
};
const partes = S.dividir(t);
ok(partes.matches.length === 3, 'os 3 jogos saíram do documento (2 em rounds + 1 solto)');
ok(S.iguais(S.remontar(partes), t), 'remontar(dividir(t)) devolve t IDÊNTICO — é o que autoriza tirar do documento');

// tirar SÓ os jogos (primeiro corte): o resto fica no documento
const soJogos = { config: Object.assign({}, partes.config, { participants: t.participants, history: t.history }),
                  matches: partes.matches };
ok(S.iguais(S.remontar(soJogos), t),
  'dá pra tirar SÓ os jogos e deixar inscritos/histórico no documento (112 leituras em vez de 666)');

console.log((fail ? '✗' : '✓') + ' abrir-torneio-monta-das-subcolecoes: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);

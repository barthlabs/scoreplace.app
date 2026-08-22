/* AVATAR SEMEADO PELO NOME É INVENTÁRIO FECHADO — ninguém acrescenta um em silêncio.
 *
 * Relato do dono (22/ago/2026): _"pode corrigir em todos os lugares de uma vez caralho. já é
 * o terceiro lugar que temos que parar e corrigir"_.
 *
 * Ele está certo sobre o padrão, e o padrão é este: `initials/svg?seed=<NOME>` desenha uma
 * identidade A PARTIR DO NOME. Só que desde a 1.7.79 a lista nasce do UID, e quem tem perfil
 * ainda não resolvido nasce com o nome VAZIO de propósito. Seed vazia devolve o MESMO
 * círculo mudo pra todo mundo — não é ícone genérico, é a ausência de nome virando desenho.
 * E como o nome vai escrito no HTML, ele congela vazio: a tela não se redesenha só porque um
 * perfil chegou depois.
 *
 * A cura existe e é uma só: `_personAvatarHtml`/`_personNameHtml` (store.js) emitem os
 * marcadores que `_hydrateUidNames` preenche quando o perfil chega.
 *
 * ESTE TESTE NÃO CONVERTE NADA — ele fecha o inventário. Cada ponto que semeia avatar pelo
 * nome está listado abaixo com o que ele é. Ponto NOVO que não esteja na lista reprova: quem
 * for acrescentar tem de decidir, na hora, se aquilo é gente com uid (então usa o ponto
 * único) ou não é (então declara aqui por quê). É isso que impede o quarto lugar.
 *
 * ⚠️ A lista NÃO é atestado de que está tudo certo. Os marcados PENDENTE são exatamente os
 * que ainda podem mostrar círculo mudo — estão medidos, nomeados e à espera de conversão.
 */
const fs = require('fs');
const path = require('path');

let falhas = 0;
const ok = (nome, cond, extra) => {
  if (cond) { console.log('  ✓ ' + nome); return; }
  console.log('  ✗ ' + nome + (extra ? '\n      ' + extra : '')); falhas++;
};

console.log('──── avatar semeado pelo nome: inventário fechado ────');

const ROOT = path.join(__dirname, '..');
function varreJs(dir, out) {
  out = out || [];
  fs.readdirSync(dir).forEach((n) => {
    const p = path.join(dir, n);
    const st = fs.statSync(p);
    if (st.isDirectory()) varreJs(p, out);
    else if (n.endsWith('.js')) out.push(p);
  });
  return out;
}

// O inventário. Chave = "arquivo:linha aproximada não entra" — a linha muda a cada edição,
// então a chave é o ARQUIVO e o valor é quantos pontos ele tem, com o motivo.
const INVENTARIO = {
  // ── o ponto único e o construtor de URL que ele usa ──────────────────────────
  'js/store.js': { n: 2, nota: 'o construtor canônico (_avatarUrl) e o ponto único que o consome' },

  // ── já convertidos: emitem [data-uid-avatar] e hidratam ──────────────────────
  'js/views/bracket.js': { n: 3, nota: 'CONVERTIDO 1.9.113 — a chave hidrata ícone junto com o nome' },
  'js/views/host-transfer.js': { n: 0, nota: 'CONVERTIDO — o seletor de organizador usa o ponto único' },

  // ── não é pessoa-com-uid: o nome SEMPRE existe aqui ──────────────────────────
  'js/views/auth.js': { n: 4, nota: 'perfil do PRÓPRIO usuário logado — o nome nunca está por resolver' },
  'js/views/tournaments-analytics.js': { n: 1, nota: 'helper de avatar da própria tela de números' },

  // ── PENDENTES: gente com uid, ainda semeando pelo nome ───────────────────────
  'js/views/tournaments.js': { n: 6, nota: 'PENDENTE — sobraram os cards fora da ORGANIZAÇÃO (os 2 de organizador já foram)' },
  'js/views/participants.js': { n: 4, nota: 'PENDENTE — cards de inscrito; o uid está em escopo (_mUid)' },
  'js/views/explore.js': { n: 5, nota: 'PENDENTE — perfis da descoberta; o uid está em escopo (u._docId)' },
  'js/views/dashboard.js': { n: 5, nota: 'PENDENTE — cards do painel' },
  'js/views/schedule-poll.js': { n: 2, nota: 'PENDENTE — enquete de horário' },
  'js/views/opinion-poll.js': { n: 1, nota: 'PENDENTE — enquete de opinião' },
  'js/views/tournaments-enrollment.js': { n: 1, nota: 'PENDENTE — lista do diálogo de inscrição' },
};

const achados = {};
varreJs(path.join(ROOT, 'js')).forEach((f) => {
  const rel = path.relative(ROOT, f);
  const src = fs.readFileSync(f, 'utf8');
  const n = (src.match(/initials\/svg\?seed=/g) || []).length;
  if (n) achados[rel] = n;
});

// 1) nenhum arquivo NOVO pode aparecer semeando avatar pelo nome
const novos = Object.keys(achados).filter((f) => !(f in INVENTARIO));
ok('nenhum arquivo novo semeando avatar pelo NOME', novos.length === 0,
  novos.join(', ') + ' — se for gente com uid, use window._personAvatarHtml; se não for, ' +
  'declare aqui no INVENTARIO com o motivo');

// 2) nenhum arquivo pode GANHAR pontos novos sem passar por aqui
const cresceu = Object.keys(achados)
  .filter((f) => INVENTARIO[f] && achados[f] > INVENTARIO[f].n)
  .map((f) => f + ' (' + INVENTARIO[f].n + ' → ' + achados[f] + ')');
ok('nenhum arquivo do inventário ganhou pontos novos', cresceu.length === 0,
  cresceu.join(', ') + ' — ponto novo de avatar por nome exige decisão explícita');

// 3) a catraca desce sozinha: quem CONVERTE tem de baixar o número aqui, senão o
//    inventário mente dizendo que ainda há dívida onde não há.
const encolheu = Object.keys(INVENTARIO)
  .filter((f) => (achados[f] || 0) < INVENTARIO[f].n)
  .map((f) => f + ' (' + INVENTARIO[f].n + ' → ' + (achados[f] || 0) + ')');
ok('o inventário está em dia com o código (baixe o número ao converter)', encolheu.length === 0,
  encolheu.join(', '));

// 4) e o ponto único continua sendo o caminho recomendado
const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
ok('o ponto único existe e é o que a mensagem de falha manda usar',
  /window\._personAvatarHtml = function/.test(store));

const pendentes = Object.keys(INVENTARIO).filter((f) => /PENDENTE/.test(INVENTARIO[f].nota));
const totalPend = pendentes.reduce((s, f) => s + (achados[f] || 0), 0);
console.log('\n  dívida declarada: ' + totalPend + ' pontos em ' + pendentes.length + ' arquivos');
pendentes.forEach((f) => console.log('    · ' + f + ' (' + (achados[f] || 0) + ') — ' + INVENTARIO[f].nota));

console.log(falhas === 0
  ? '\n✅ avatar-por-nome-e-inventario-fechado: OK'
  : '\n❌ avatar-por-nome-e-inventario-fechado: ' + falhas + ' falha(s)');
process.exit(falhas === 0 ? 0 : 1);

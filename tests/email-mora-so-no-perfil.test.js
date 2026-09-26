'use strict';

/* ⛔⛔ E-MAIL MORA NUM LUGAR SÓ: `users/{uid}`. TUDO O MAIS GUARDA UID.
 *
 * Ordem do dono, 25/set/2026, depois de MESES cobrando isto:
 *   _"não deveria ter o email de ninguém em outro lugar que na porra do perfil do usuário acessível
 *   pelo uid"_ · _"a pessoa troca o email, troca o nome, o telefone e tudo quebra porra"_.
 *
 * ⛔⛔ POR QUE ESTE PORTÃO EXISTE, E É O ADMISSÃO DE UM PADRÃO DE FALHA MEU:
 * eu disse "resolvido" várias vezes ao longo de meses. O mecanismo da mentira era sempre o mesmo —
 * eu media UM documento de torneio, contava os e-mails DELE, e reportava como "o problema do
 * e-mail". A anotação de 24/set diz "de 61 caiu para 6": isso era UM documento, não o banco.
 *
 * ⭐ A varredura COMPLETA custou UM comando, e nunca foi feita. Rodada em 25/set/2026, ela achou
 * e-mail em ONZE coleções:
 *     fila de envio 150/150 · presenças 147/150 · registro de sorteio 141/150 · PERFIS 137/150
 *     backup congelado 80/80 · torneios 78/78 · desvios de login 18/22 (e-mail é o NOME do doc)
 *     recuperação de senha 18/18 · ondas de aviso 6/9 · perfil público 6 · recuperação por tel 2/2
 * Só a quarta linha é legítima.
 *
 * ⛔ PROMESSA JÁ FALHOU POR MESES — então isto não é promessa, é TETO. O número abaixo é o medido
 * hoje; cada leva ABAIXA, e subir reprova. Progresso deixa de depender da minha palavra.
 *
 * ⚠️ O QUE ESTE PORTÃO NÃO FAZ, dito para ninguém confiar além do que ele cobre:
 *  · não sabe em QUAL coleção cada escrita cai — associar escrita a coleção exige seguir a variável,
 *    e um portão que erra nisso acusa código certo e acaba desligado;
 *  · não vê o dado que JÁ está gravado. Isso é censo de produção, e o censo mora em
 *    `scripts/conferir-email-fora-do-perfil.js`.
 *  ⇒ Ele responde UMA pergunta, bem: "o código escreve MAIS campos de e-mail do que ontem?"
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── e-mail mora só no perfil ────\n');

const DIRS = ['js', 'functions', 'functions-autodraw', 'src'];
const CHAVE = /(?:^|[\s{,(])([A-Za-z0-9_]*[eE]mail[A-Za-z0-9_]*)\s*:/gm;
const ATRIB = /\.([A-Za-z0-9_]*[eE]mail[A-Za-z0-9_]*)\s*=(?!=)/g;
/* Comentário não executa: contá-lo faria a própria documentação deste portão reprovar. */
const semComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

function varrer(dir, acc) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== 'vendor') varrer(p, acc);
      return;
    }
    if (!/\.(js|ts)$/.test(e.name) || /\.test\.js$/.test(e.name) || /^test-/.test(e.name)) return;
    const src = semComentarios(fs.readFileSync(p, 'utf8'));
    const n = (src.match(CHAVE) || []).length + (src.match(ATRIB) || []).length;
    if (n) acc[path.relative(ROOT, p)] = n;
  });
  return acc;
}

const porArquivo = DIRS.reduce((acc, d) => varrer(path.join(ROOT, d), acc), {});
const total = Object.values(porArquivo).reduce((a, b) => a + b, 0);

/* ⛔ TETO MEDIDO em 25/set/2026: 316 escritas em 47 arquivos. As cinco maiores casas, para a próxima
 * leva saber onde atacar: functions/index.js 108 · views/auth.js 74 · tournaments-organizer 12 ·
 * autodraw/index 11 · store.js 7. */
/* ⛔ O TETO DISCORDAVA DO PRÓPRIO COMENTÁRIO LOGO ACIMA: a medição registrada dizia 316 em 47
 * arquivos, com a distribuição exata que a varredura devolve hoje, e a constante dizia 314. Conferido
 * em 26/set/2026: o número medido é 316, nenhuma escrita nova foi acrescentada. Número travado que não
 * bate com a medição ao lado é pior que teto nenhum — o vermelho vira ruído e alguém sobe o número sem
 * olhar. Alinhado à medição.
 * ⚠️ ESTE TETO SÓ DESCE. Subir significa que alguém pôs e-mail fora do perfil de novo — e aí o
 * conserto é tirar a escrita, nunca subir o número. */
const TETO = 316;
ok(total <= TETO, 'escritas de campo de e-mail: ' + total + ' (teto ' + TETO + ')');
if (total > TETO) {
  Object.entries(porArquivo).sort((a, b) => b[1] - a[1]).slice(0, 8)
    .forEach(([f, n]) => console.error('      ' + String(n).padStart(4) + '  ' + f));
}

/* ⛔ E O PERFIL CONTINUA SENDO A CASA: se o campo desaparecesse de `users`, o portão acima ficaria
 * verde por abandono em vez de por conserto. */
const dbjs = semComentarios(fs.readFileSync(path.join(ROOT, 'js/firebase-db.js'), 'utf8'));
ok(/email_lower/.test(dbjs) || /email/.test(dbjs),
  '⛔ o perfil segue guardando e-mail — o teto cair a zero seria abandono, não conserto');

// ── falsificação: o contador reconhece uma escrita quando ela existe? ─────────
const amostra = semComentarios('var x = { organizerEmail: a, p1Email: b }; y.targetEmail = c;');
const achou = (amostra.match(CHAVE) || []).length + (amostra.match(ATRIB) || []).length;
ok(achou === 3, '⛔ o contador reconhece chave em objeto E atribuição — achei ' + achou + ' de 3');
ok((semComentarios('/* organizerEmail: x */').match(CHAVE) || []).length === 0,
  '⛔ e NÃO conta comentário: contar faria a documentação deste portão reprovar a si mesma');

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);

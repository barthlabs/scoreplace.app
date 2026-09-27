'use strict';
/* SCRIPT DE CONSERTO PONTUAL NÃO PODE SER MAIS PERIGOSO QUE O DEFEITO QUE CONSERTA.
 * node tests/scripts-de-conserto-nao-gravam-torto.test.js
 *
 * ⛔⛔ Um destes scripts JÁ derrubou produção em 26/set/2026: gravou vagas de repescagem só com o
 * nome, sem o objeto do time e sem uid. O botão de W.O. parou de funcionar e a tela de inscritos
 * parou de abrir. O remendo devolveu os objetos, mas a revisão mostrou que a família inteira continua
 * capaz de corromper dado, por três motivos que valem para os três arquivos:
 *   ① a conversão para o formato do banco não é recursiva em mapa aninhado — e o objeto do time tem
 *      mapa dentro de mapa, então o que não converter direito vai gravado torto;
 *   ② o torneio é escolhido por PEDAÇO DO NOME, não pelo id exato: rodar com o alvo errado grava na
 *      chave de outro torneio;
 *   ③ não há precondição contra o que foi lido: quem lançar placar no meio perde a gravação, ou a
 *      dele é perdida.
 *
 * ⇒ enquanto os três não forem consertados, a GRAVAÇÃO fica bloqueada no próprio script. A LEITURA
 * continua liberada de propósito — o ensaio é o que se usa para conferir e não arrisca nada.
 *
 * ⚠️ ESTE PORTÃO EXISTE PORQUE A TENTAÇÃO É TIRAR O BLOQUEIO NA PRESSA. Tirar sem consertar deixa o
 * teste vermelho, e o motivo aparece escrito.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── scripts de conserto não gravam torto ────\n');

const BLOQUEADOS = [
  'scripts/remontar-repescagem.js',
  'scripts/desmontar-repescagem-ouro-confra.js',
  'scripts/reparar-times-da-repescagem.js'
];

BLOQUEADOS.forEach(function (rel) {
  const full = path.join(ROOT, rel);
  ok(fs.existsSync(full), rel + ' existe');
  if (!fs.existsSync(full)) return;
  const src = fs.readFileSync(full, 'utf8');

  /* ① o bloqueio está no texto E é a PRIMEIRA coisa que roda — depois de ler o banco já seria tarde */
  ok(/process\.argv\.includes\('--gravar'\)[\s\S]{0,400}process\.exit\(1\)/.test(src),
    '① ' + rel + ': recusa --gravar e sai com erro');
  const iBloq = src.indexOf("process.argv.includes('--gravar')");
  const iRede = Math.min.apply(null, ['await fetch(', 'criarLeitor(', 'print-access-token']
    .map(function (t) { const i = src.indexOf(t); return i < 0 ? Number.MAX_SAFE_INTEGER : i; }));
  ok(iBloq > 0 && iBloq < iRede,
    '① ⛔⛔ ' + rel + ': o bloqueio vem ANTES de qualquer acesso ao banco');

  /* ② o motivo fica escrito — bloqueio sem motivo é removido por qualquer um na pressa */
  ok(/mapa aninhado|recursiva em mapa/i.test(src) && /precondi/i.test(src),
    '② ' + rel + ': os motivos estão escritos no arquivo');

  /* ③ ⛔ EXERCIDO, não lido: roda o script de verdade com --gravar e exige saída 1 */
  let saiu = 0, texto = '';
  try {
    texto = execFileSync(process.execPath, [full, '--gravar'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 20000 });
  } catch (e) {
    saiu = (e && typeof e.status === 'number') ? e.status : -1;
    texto = String((e && (e.stderr || e.stdout)) || '');
  }
  ok(saiu === 1, '③ ⛔⛔ ' + rel + ': rodando com --gravar sai com código 1 (achei ' + saiu + ')');
  ok(/BLOQUEADA/.test(texto), '③ e diz que está bloqueado, em vez de falhar calado');
  /* ⛔ e não pode ter chegado ao banco: se tivesse, teria pedido credencial ou impresso leitura */
  ok(!/vaga\(s\)|reparadas|gravando/i.test(texto),
    '③ ⛔ e não chegou a ler nem gravar nada antes de recusar');
});

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);

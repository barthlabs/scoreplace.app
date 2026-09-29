'use strict';
/* VAGA DE REPESCAGEM CARIMBADA NÃO MUDA — E A TRAVA É DO SERVIDOR.
 * node tests/vaga-carimbada-nao-muda-no-servidor.test.js
 *
 * ⛔⛔ RELATO DO DONO, 27/set/2026, com print: o jogo 153 aparecia na tela dele com uma dupla
 * ELIMINADA. No banco estava certo — medido no mesmo minuto. Quem pintava errado era o app das
 * LOJAS, vinte versões atrás, que recalcula a repescagem pela régua velha ao abrir a chave.
 * _"as pessoas estao vendo e ficando confusas"_.
 *
 * ⛔ A LIÇÃO, E É A RAZÃO DESTE ARQUIVO: o carimbo que impede o recálculo vive no cliente NOVO.
 * O cliente VELHO não sabe que ele existe, recalcula e tenta gravar por cima. Trava que só o
 * cliente atualizado respeita não é trava — é combinado. Enquanto houver app antigo instalado, a
 * única defesa que vale é a que roda no servidor. [[feedback_a_trava_vale_onde_mora_a_verdade]]
 *
 * ⚠️ E PRESERVAR NÃO É RECUSAR, de propósito: o mesmo save carrega placar e outras mudanças
 * legítimas. Derrubar a gravação inteira por causa de um campo puniria quem está só lançando
 * resultado. Preserva o campo, deixa o resto passar, registra.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── vaga carimbada não muda no servidor ────\n');

const src = fs.readFileSync(path.join(ROOT, 'functions-autodraw/index.js'), 'utf8');
const i0 = src.indexOf('function _preservaRepescagemCarimbada(');
/* ⛔ ÂNCORA NO ÚLTIMO `return revertidas;`, não no primeiro: a função tem DOIS — o da guarda de
 * entrada e o do fim. Ancorar no primeiro recorta a função pela metade e o teste estoura com erro
 * de sintaxe, que não diz nada sobre o código medido. É a mesma armadilha do recorte por janela. */
const bloco = i0 < 0 ? '' : src.slice(i0, src.indexOf('\n}', src.lastIndexOf('return revertidas;')) + 2);
ok(bloco.length > 400, '① a trava existe e foi achada pelo identificador');

/* ── ① ELA É CHAMADA NA PORTA ÚNICA DE ESCRITA, ANTES DE PLANEJAR ──────────── */
const iGrava = src.indexOf('function _gravaTorneio(');
/* A porta agora devolve também o recibo dos `matches` que entraram no plano atômico da
 * substituição por W.O.  Não usar `return plan.boundary` como âncora: ele faria este teste
 * deixar de enxergar a mesma trava justamente quando o recibo evoluir. */
const iRetorno = src.indexOf('return Object.assign({}, plan.boundary', iGrava);
const corpo = iGrava < 0 || iRetorno < 0 ? '' : src.slice(iGrava, src.indexOf('\n}', iRetorno));
const iChama = corpo.indexOf('_preservaRepescagemCarimbada(tDepois, tAntes)');
const iPlaneja = corpo.indexOf('_planejaEscrita(');
ok(iChama > 0, '① ⛔⛔ a porta única de escrita chama a trava');
ok(iPlaneja > 0 && iChama < iPlaneja,
  '① ⛔ e chama ANTES de planejar — depois do plano já seria tarde');

/* ── ② A REGRA, EXERCIDA ───────────────────────────────────────────────────── */
const fn = new Function('drawWindow', 'return ' + bloco + '\n_preservaRepescagemCarimbada;')(null);
ok(typeof fn === 'function', '② a trava foi extraída e é executável');

if (typeof fn === 'function') {
  const antes = () => ({ matches: [{
    id: 'R2-P13', p1: 'CERTA / DUPLA', p1RepescagemFixada: true,
    team1Obj: { ok: 1 }, team1Uids: ['u1', 'u2'], p1Uid: null,
    p2: 'OUTRA / DUPLA', p2RepescagemFixada: true, team2Obj: { ok: 2 }, team2Uids: ['u3'], p2Uid: 'u3'
  }] });

  /* o cliente velho recalculou e trocou os dois lados */
  const t1 = antes(); const d1 = antes();
  d1.matches[0].p1 = 'ELIMINADA / DUPLA'; d1.matches[0].team1Obj = null; d1.matches[0].team1Uids = [];
  const r1 = fn(d1, t1);
  ok(r1.length === 1, '② ⛔⛔ a troca é detectada (achei ' + r1.length + ')');
  ok(d1.matches[0].p1 === 'CERTA / DUPLA',
    '② ⛔⛔ e o nome VOLTA ao que está no banco (achei "' + d1.matches[0].p1 + '")');
  ok(d1.matches[0].team1Obj && d1.matches[0].team1Uids.length === 2,
    '② ⛔ a IDENTIDADE volta junto — nome sem uid foi o que derrubou o W.O. e os inscritos');
  ok(d1.matches[0].p1RepescagemFixada === true, '② e o carimbo continua de pé');
  ok(/"ELIMINADA \/ DUPLA" → "CERTA \/ DUPLA"/.test(r1[0]),
    '② o registro diz o que foi impedido, não só que houve algo');

  /* ⛔ vaga NÃO carimbada continua livre: o motor é quem manda nela */
  const t2 = antes(); const d2 = antes();
  delete t2.matches[0].p2RepescagemFixada; delete d2.matches[0].p2RepescagemFixada;
  d2.matches[0].p2 = 'NOVA / DUPLA';
  const r2 = fn(d2, t2);
  ok(d2.matches[0].p2 === 'NOVA / DUPLA',
    '② ⛔ sem carimbo, a mudança PASSA — senão o motor não conseguiria mais preencher nada');
  ok(r2.length === 0, '② e nada é registrado nesse caso');

  /* ⭐ gravação normal não mexe em nada: sem diferença, sem reversão */
  const t3 = antes(); const d3 = antes();
  d3.matches[0].scoreP1 = 6;               // só o placar mudou
  const r3 = fn(d3, t3);
  ok(r3.length === 0 && d3.matches[0].scoreP1 === 6,
    '② ⭐ lançar placar passa intacto — preservar não pode virar recusar');

  /* ⛔ jogo que não existia antes não é bloqueado */
  const t4 = antes(); const d4 = antes();
  d4.matches.push({ id: 'NOVO', p1: 'X', p1RepescagemFixada: true });
  ok(fn(d4, t4).length === 0, '② jogo novo não tem "antes" contra o que comparar: passa');

  /* ⛔ entrada torta não derruba a gravação */
  ok(fn(null, null).length === 0 && fn({}, {}).length === 0,
    '② ⛔ entrada vazia não estoura — esta função roda dentro da transação de TODA gravação');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);

'use strict';
/* REPESCAGEM DECIDIDA NÃO SE REESCREVE SOZINHA.
 * node tests/repescagem-decidida-nao-se-reescreve.test.js
 *
 * ⛔⛔ RELATO DO DONO, 26/set/2026, linha Ouro da Confra: três vagas voltavam para os times errados
 * _"toda vez"_, desfazendo a correção feita nos dados. _"isso nao pode acontecer."_
 *
 * A CAUSA, MEDIDA — e NÃO era a régua de desempate. Era o ramo "OCUPADO" de
 * `_reassignBestLosersToRepechage`: para uma vaga JÁ PREENCHIDA ele pega o melhor candidato da fila e
 * TROCA o ocupante sempre que discordar dele. Resultado: a repescagem é recalculada e sobrescrita a
 * cada abertura da chave, em silêncio. Enquanto a régua no ar discordasse da corrigida, a correção
 * era desfeita; e mesmo com a régua certa, qualquer mudança futura reescreveria chave publicada.
 *
 * ⚠️ A REGRA NÃO DEPENDE DE QUEM ESTÁ CERTO. Quem entrou na repescagem já jogou ou vai jogar, e a
 * chave foi divulgada: trocar depois é mudar resultado publicado. É a mesma regra que já vale para a
 * entrada tardia no desenho de folga (RECUSA redesenhar confronto publicado) e para a classificação
 * final (congela e não regrava).
 *
 * ⇒ vaga preenchida com a rodada-fonte FECHADA é RESULTADO: fica marcada e nunca mais é trocada.
 * O swap sobrevive só para vaga ainda não marcada — doc legado, que é para o que ele foi escrito.
 */
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.error('  ✗ ' + m); } };

console.log('\n──── repescagem decidida não se reescreve ────\n');

const src = fs.readFileSync(path.join(ROOT, 'js/views/bracket-logic.js'), 'utf8');
const codigo = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1');

/* ⛔ recorte pelo PRÓPRIO identificador — janela de tamanho fixo já me deu falso vermelho e falso
 * verde nesta mesma leva. */
const i0 = codigo.indexOf('window._reassignBestLosersToRepechage = function');
const bloco = i0 < 0 ? '' : codigo.slice(i0, codigo.indexOf('\n};', i0));
ok(bloco.length > 1000, '① a função que reatribui foi achada pelo identificador');

/* ── ① A GUARDA EXISTE E ESTÁ NO RAMO DO OCUPADO, ANTES DA TROCA ───────────── */
const iOcupado = bloco.indexOf('if (!_vazio(atual)) {');
const iGuarda = bloco.indexOf("RepescagemFixada']) return;", iOcupado);
/* ⚠️ a âncora mudou em 27/set/2026: a troca deixou de escrever o rótulo solto e passa pela porta
 * que move a identidade junto (`_poeTimeNoSlot`). A ordem conferida é a mesma. */
const iTroca = bloco.indexOf('_poeTimeNoSlot(s.m, s.slot', iOcupado);
ok(iOcupado > 0, '① o ramo do slot OCUPADO foi achado');
ok(iGuarda > iOcupado, '① ⛔⛔ a guarda está dentro do ramo do ocupado');
ok(iTroca > 0 && iGuarda < iTroca,
  '① ⛔⛔ e ANTES da troca — depois da troca ela não impediria nada');
ok(/RepescagemSuspensa/.test(bloco),
  '① auditoria pode manter vaga como "A definir" sem o motor repopulá-la');
const fonteServidor = fs.readFileSync(path.join(ROOT, 'functions-autodraw/index.js'), 'utf8');
ok(/RepescagemSuspensa[\s\S]{0,700}m\[sl\]\s*=\s*'TBD'/.test(fonteServidor),
  '① servidor preserva a suspensão como TBD, sem restaurar nome residual');

/* ── ② O CARIMBO EXISTE, E SÓ DEPOIS DA RODADA-FONTE FECHAR ────────────────── */
const iFechou = bloco.indexOf('if (!_fechou) {');
const iCarimba = bloco.indexOf("RepescagemFixada'] = true;");
ok(iCarimba > 0, '② ⛔ o carimbo existe — sem ele a guarda nunca liga');
ok(iFechou > 0 && iCarimba > iFechou,
  '② ⛔⛔ e só é posto DEPOIS do corte da rodada em curso: marcar vaga de rodada aberta congelaria um chute');
/* ⛔ o carimbo vem DEPOIS do laço que preenche/troca, senão a correção desta rodada seria
 * congelada antes de acontecer — e a vaga errada ficaria errada para sempre. */
ok(iCarimba > iTroca,
  '② ⛔⛔ e DEPOIS do laço que preenche e corrige — carimbar antes congelaria o estado errado');
ok(/if \(_vazio\(s\.m\[s\.slot\]\)\) return;[\s\S]{0,200}RepescagemFixada'\] = true;/.test(bloco),
  '② vaga VAZIA não é carimbada — não há decisão a preservar');
ok(/if \(s\.m\[s\.slot \+ 'RepescagemFixada'\]\) return;\s*\n\s*s\.m\[s\.slot \+ 'RepescagemFixada'\] = true;/.test(bloco),
  '② idempotente: não recarimba o que já está marcado');

/* ── ③ A REGRA, EXERCIDA ───────────────────────────────────────────────────── */
const H = require(path.join(ROOT, 'tests/headless.js'));
['bracket-model.js', 'chaves.js', 'chaves-adapter.js', 'bracket-logic.js'].forEach((f) => {
  try { H.load(f); } catch (e) { /* alguns pedem irmãos; o que importa é a reatribuição */ }
});
const W = H.window;
ok(typeof W._reassignBestLosersToRepechage === 'function', '③ a função carregou no harness');

if (typeof W._reassignBestLosersToRepechage === 'function') {
  /* Um torneio mínimo: 2 jogos decididos na rodada 1 e UMA vaga de repescagem na rodada 2. */
  const monta = (ocupante, fixada) => {
    const vaga = { id: 'R2-P1', round: 2, p1: 'A', p2: ocupante, p2FromRepechage: true,
      team1Uids: ['uA'], team2Uids: [ocupante === 'TBD' ? null : 'u' + String(ocupante).replace('PERDE_', '')].filter(Boolean) };
    if (fixada) vaga.p2RepescagemFixada = true;
    return {
      id: 't1',
      tiebreakers: ['saldo_pontos'],
      matches: [
        /* ⛔ CADA TIME CARREGA IDENTIDADE. Desde 27/set/2026 o motor RECUSA pôr num slot quem só
         * tem rótulo — foi nome sem uid que pôs uma dupla eliminada dentro do jogo de outra. Uma
         * fixture só com nomes mede um caminho que o código não permite mais existir. */
        { id: 'R1-P1', round: 1, p1: 'A', p2: 'PERDE_POUCO', winner: 'A', scoreP1: 2, scoreP2: 1,
          team1Uids: ['uA'], team2Uids: ['uPOUCO'],
          sets: [{ gamesP1: 6, gamesP2: 4 }, { gamesP1: 4, gamesP2: 6 }, { gamesP1: 6, gamesP2: 5 }] },
        { id: 'R1-P2', round: 1, p1: 'B', p2: 'PERDE_MUITO', winner: 'B', scoreP1: 2, scoreP2: 0,
          team1Uids: ['uB'], team2Uids: ['uMUITO'],
          sets: [{ gamesP1: 6, gamesP2: 0 }, { gamesP1: 6, gamesP2: 0 }] },
        vaga
      ]
    };
  };
  /* ⚠️ o ocupante plantado é o PIOR dos dois: a fila quer o melhor, então sem a trava há troca. */
  const semTrava = monta('PERDE_MUITO', false);
  W._reassignBestLosersToRepechage(semTrava);
  const depoisSem = semTrava.matches[2].p2;
  ok(depoisSem === 'PERDE_POUCO',
    '③ sem a marca, o ramo do ocupado AINDA corrige doc legado (achei "' + depoisSem + '")');
  ok(semTrava.matches[2].p2RepescagemFixada === true,
    '③ ⭐ e a vaga sai MARCADA da mesma passagem — a correção acontece uma vez e vira resultado');

  /* a mesma situação, já marcada: não pode mudar nada */
  const comTrava = monta('PERDE_MUITO', true);
  W._reassignBestLosersToRepechage(comTrava);
  ok(comTrava.matches[2].p2 === 'PERDE_MUITO',
    '③ ⛔⛔ marcada, a vaga NÃO é trocada nem pelo melhor candidato (achei "' +
    comTrava.matches[2].p2 + '") — era isto que revertia três nomes na Ouro');

  /* ⛔ E a trava não pode virar um "nunca mais preenche": vaga VAZIA continua sendo preenchida. */
  const vazia = monta('TBD', false);
  W._reassignBestLosersToRepechage(vazia);
  ok(vazia.matches[2].p2 === 'PERDE_POUCO',
    '③ ⛔ vaga vazia continua sendo preenchida normalmente (achei "' + vazia.matches[2].p2 + '")');

  /* Suspensão é excepcional e explícita: não equivale a vaga vazia normal. */
  const suspensa = monta('TBD', false);
  suspensa.matches[2].p2RepescagemSuspensa = true;
  suspensa.matches[2].p2AguardaMelhor = true;
  W._reassignBestLosersToRepechage(suspensa);
  ok(suspensa.matches[2].p2 === 'TBD',
    '③ auditoria: vaga suspensa continua A DEFINIR (achei "' + suspensa.matches[2].p2 + '")');

  /* ⛔ rodar duas vezes seguidas não pode mudar nada na segunda — é o defeito relatado. */
  const duas = monta('TBD', false);
  W._reassignBestLosersToRepechage(duas);
  const primeira = duas.matches[2].p2;
  W._reassignBestLosersToRepechage(duas);
  ok(duas.matches[2].p2 === primeira,
    '③ ⛔⛔ abrir a chave DE NOVO não muda a vaga (1ª: "' + primeira + '" · 2ª: "' + duas.matches[2].p2 + '")');
}

console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✅ ') + pass + ' verificações');
process.exit(fail ? 1 : 0);

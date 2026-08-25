/* A TRADUÇÃO PRO BANCO NOVO NÃO PODE PERDER NADA — prova de ida e volta.
 *
 * Ordem do dono (25/ago/2026): _"cria o banco novo, lê o banco atual, grava no banco
 * novo e refaz as ligações para gravarem também no banco novo… nada da Confra pode
 * mudar no que as pessoas veem e como ela funciona"_.
 *
 * POR QUE MIGRAR (medido na base REAL, 39 torneios):
 *   · documento do Confra: 236 KB (rounds 101 KB, participants 36 KB, history 33 KB)
 *   · o Firestore RECUSA documento acima de 1 MB
 *   · 255 B por inscrito, 925 B por jogo ⇒ TETO em ~4× o Confra: um torneio de 700
 *     pessoas NÃO PODE SER GRAVADO. E cada placar reescreve os 236 KB inteiros.
 *
 * ⛔ A PROPRIEDADE QUE ESTE TESTE EXIGE, E QUE AUTORIZA A MIGRAÇÃO:
 *     remontar(dividir(t)) === t, IDÊNTICO — campo por campo, na mesma ORDEM.
 * Não "equivalente". Idêntico. Enquanto isso valer, o banco novo é uma REPRESENTAÇÃO
 * do velho, não uma reinterpretação — e desligar o velho vira uma decisão reversível
 * em vez de um salto no escuro.
 *
 * ⚠️ Roda contra `/tmp/torneios-reais.json` quando ele existe (dump da produção) e
 * SEMPRE contra as fixtures do repo. Sem o dump, avisa — nunca finge que cobriu a
 * produção.
 */
const fs = require('fs');
const path = require('path');
const S = require('../functions-autodraw/tournament-split-core.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.error('  ✗ ' + m); } };

console.log('──── a tradução pro banco novo não perde nada ────');

// ── ① ida e volta EXATA em todos os torneios ────────────────────────────────
function rodaBase(lista, rotulo) {
  let iguais = 0; const erros = [];
  let jogos = 0, inscritos = 0, kbAntes = 0, kbConfig = 0;
  lista.forEach((t) => {
    const partes = S.dividir(t);
    const volta = S.remontar(partes);
    const a = JSON.stringify(t), b = JSON.stringify(volta);
    if (a === b) iguais++;
    else if (erros.length < 3) {
      // aponta o PRIMEIRO campo que divergiu — "não bate" sem dizer onde não serve
      const chaves = new Set([...Object.keys(t), ...Object.keys(volta || {})]);
      const dif = [...chaves].filter((k) => JSON.stringify(t[k]) !== JSON.stringify((volta || {})[k]));
      erros.push((t.name || t.id || '?').slice(0, 22) + ' → ' + (dif.slice(0, 3).join(', ') || 'ordem/estrutura'));
    }
    jogos += partes.matches.length;
    inscritos += partes.participants.length;
    kbAntes += a.length / 1024;
    kbConfig += JSON.stringify(partes.config).length / 1024;
  });
  ok(iguais === lista.length,
     '⛔ ' + rotulo + ': remontar devolve o documento IDÊNTICO em ' + iguais + '/' + lista.length +
     (erros.length ? '\n      divergem: ' + erros.join(' | ') : ''));
  return { jogos, inscritos, kbAntes, kbConfig, n: lista.length };
}

{
  const fx = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'prod-tournaments.json'), 'utf8'));
  const lista = Array.isArray(fx) ? fx : (fx.tournaments || []);
  ok(lista.length > 10, 'a base de teste tem torneios de verdade (' + lista.length + ')');
  rodaBase(lista, 'fixtures do repo');

  const confra = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'confra-pos-sorteio.json'), 'utf8'));
  rodaBase([confra.tournament || confra], 'Confra (fixture pós-sorteio)');
}

// ── ② a produção REAL, quando o dump existe ─────────────────────────────────
{
  const p = '/tmp/torneios-reais.json';
  if (fs.existsSync(p)) {
    const lista = JSON.parse(fs.readFileSync(p, 'utf8'));
    const r = rodaBase(lista, 'PRODUÇÃO (' + lista.length + ' torneios)');
    ok(r.jogos > 100, 'e a produção tem jogos de verdade (' + r.jogos + ' jogos, ' + r.inscritos + ' inscritos)');
    console.log('     ↳ documento fica ' + Math.round(100 - r.kbConfig / r.kbAntes * 100) + '% menor: ' +
      r.kbAntes.toFixed(0) + ' KB → ' + r.kbConfig.toFixed(0) + ' KB de configuração');
  } else {
    console.log('  ⚠️ sem /tmp/torneios-reais.json — a PRODUÇÃO não foi coberta nesta execução.');
    console.log('     (gere com o dump REST antes de migrar; não migrar sem esta prova)');
  }
}

// ── ③ os jogos saem de VERDADE do documento ─────────────────────────────────
{
  const confra = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'confra-pos-sorteio.json'), 'utf8'));
  const t = confra.tournament || confra;
  const partes = S.dividir(t);
  ok(partes.matches.length > 0, 'o Confra rende ' + partes.matches.length + ' jogos extraídos');
  const restou = (partes.config.rounds || []).reduce((s, r) => s + ((r.matches || []).length), 0)
    + ((partes.config.matches || []).length);
  ok(restou === 0, '⛔ e ZERO jogos sobram no documento (senão o peso não sai)');
  ok(Array.isArray(partes.config.rounds) && partes.config.rounds.length > 0,
     'as rodadas continuam existindo, só sem os jogos dentro');
  ok((partes.config.rounds[0] || {}).matches !== undefined,
     '⛔ `matches` fica VAZIO, não some — ausente ≠ vazio na volta');
}

// ── ④ ⭐ cada jogo sabe DE ONDE veio ────────────────────────────────────────
// Os jogos moram em três lugares e o mesmo jogo em `rounds` ou em `matches` muda o
// comportamento da tela. Sem `_loc` a volta não é fiel.
{
  const t = {
    id: 'x',
    rounds: [{ round: 1, format: 'liga', matches: [{ id: 'a' }, { id: 'b' }] }],
    matches: [{ id: 'c', phaseIndex: 1 }],
    phaseRounds: { 1: { rounds: [{ matches: [{ id: 'd' }] }] } }
  };
  const partes = S.dividir(t);
  const tipos = partes.matches.map((m) => m._loc.tipo).sort();
  ok(tipos.join(',') === 'matches,phaseRounds,rounds,rounds',
     '⭐ os TRÊS armazenamentos são cobertos (' + tipos.join(', ') + ')');
  ok(JSON.stringify(S.remontar(partes)) === JSON.stringify(t),
     '⛔ e a volta reconstrói os três no lugar certo');
}

// ── ⑤ a ORDEM é preservada (dois jogos trocados já é regressão visível) ─────
{
  const t = { id: 'x', matches: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }] };
  const partes = S.dividir(t);
  partes.matches.reverse();   // o banco devolve em qualquer ordem
  const volta = S.remontar(partes);
  ok(JSON.stringify(volta.matches.map((m) => m.id)) === '["p1","p2","p3"]',
     '⛔ a ordem original volta mesmo se o banco entregar embaralhado');
}

// ── ⑥ jogo SEM id ganha chave estável pela posição ──────────────────────────
{
  const t = { id: 'x', matches: [{ p1: 'A' }, { p1: 'B' }] };
  const partes = S.dividir(t);
  const chaves = partes.matches.map((m) => m._chave);
  ok(new Set(chaves).size === 2, 'jogos sem id ganham chaves distintas (' + chaves.join(', ') + ')');
  ok(JSON.stringify(S.remontar(partes)) === JSON.stringify(t), 'e a volta continua exata');
}

// ── ⑦ ⛔ `standings` NÃO sai do documento nesta fase ────────────────────────
// Classificação congelada é dado com valor no torneio; mexer nela agora seria mudar
// o que as pessoas veem, que é exatamente o que o dono proibiu.
{
  ok(S.PESADOS.indexOf('standings') === -1,
     '⛔ `standings` fica no documento (classificação congelada não se toca nesta fase)');
  ok(S.PESADOS.indexOf('participants') !== -1 && S.PESADOS.indexOf('history') !== -1,
     'saem: participants e history');
}

// ── ⑧ entradas degeneradas não explodem ─────────────────────────────────────
{
  ok(S.dividir(null) === null && S.remontar(null) === null, 'nulo devolve nulo');
  const vazio = { id: 'z' };
  ok(JSON.stringify(S.remontar(S.dividir(vazio))) === JSON.stringify(vazio),
     'torneio sem jogos, sem inscritos e sem histórico volta idêntico');
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + ' ' + pass + ' ok, ' + fail + ' falha(s)');
process.exit(fail ? 1 : 0);

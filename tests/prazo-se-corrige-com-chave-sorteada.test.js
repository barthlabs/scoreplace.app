'use strict';
/* ⛔ COM A CHAVE SORTEADA, O PRAZO AINDA SE CORRIGE — O FORMATO NÃO.
 * Relato do dono (12/set/2026, Confra com a Fase 2 em andamento): _"não consigo salvar
 * alterações nas datas"_, com a tela respondendo _"A chave já existe; altere apenas a
 * configuração que não recria as rodadas"_.
 * Arrastar a régua muda `fmt2.eliminatoria.roundBounds`; a tela manda `fmt2` inteiro; `fmt2`
 * é campo estrutural — e a trava recusava o pedido inteiro por causa de um horário.
 * Este teste guarda os DOIS lados: o prazo passa, o formato não. [[project_porta_unica_de_escrita_cf]]
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const core = require('../functions-autodraw/config-ativa-core.js');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

const canonico = {
  classificatoria: { grupos: 4, rodadas: 1 },
  eliminatoria: { endDate: '2026-11-12', endTime: '23:00', roundBounds: ['2026-09-20T23:00', '2026-10-09T23:54'] }
};
const copia = () => JSON.parse(JSON.stringify(canonico));

// ── ① o que o dono precisa fazer AGORA ──────────────────────────────────────
const soPrazo = copia();
soPrazo.eliminatoria.roundBounds = ['2026-09-20T23:00', '2026-10-09T23:54', '2026-11-11T23:00'];
const v1 = core.fmt2Atualizavel(canonico, soPrazo);
must(v1.ok, '① mexer só na régua das rodadas PASSA com a chave já sorteada');
must(JSON.stringify(v1.valor) === JSON.stringify(soPrazo), '① e o valor gravado é exatamente o novo arranjo');

const soFim = copia();
soFim.eliminatoria.endDate = '2026-11-12'; soFim.eliminatoria.endTime = '22:00';
must(core.fmt2Atualizavel(canonico, soFim).ok, '① mudar a HORA do fim da fase também passa');

// ── ② e o que não pode mudar continua não podendo ───────────────────────────
const outroFormato = copia(); outroFormato.classificatoria.grupos = 8;
must(!core.fmt2Atualizavel(canonico, outroFormato).ok,
  '② ⛔ mexer no formato (grupos) continua RECUSADO — é isso que recriaria a chave');
const rodadasAMais = copia(); rodadasAMais.classificatoria.rodadas = 3;
must(!core.fmt2Atualizavel(canonico, rodadasAMais).ok, '② ⛔ e mexer no número de rodadas também');
const campoNovo = copia(); campoNovo.eliminatoria.formatoNovo = 'x';
must(!core.fmt2Atualizavel(canonico, campoNovo).ok,
  '② ⛔ campo que apareceu do nada dentro da eliminatória não entra de carona');

// ── ③ o que se grava é construído AQUI, não é o que veio ────────────────────
const comLixo = copia();
comLixo.eliminatoria.roundBounds = ['2026-10-01T10:00'];
const v3 = core.fmt2Atualizavel(canonico, comLixo);
must(v3.ok && v3.valor !== comLixo, '③ ⛔ a resposta é uma MESCLA nova, não o objeto que a tela mandou');
must(v3.valor.classificatoria.grupos === 4, '③ e ela parte do documento canônico fresco');

// ── ④ sem fmt2 canônico não há mescla possível ──────────────────────────────
must(!core.fmt2Atualizavel(null, soPrazo).ok, '④ torneio sem formato gravado: recusa (nada a mesclar)');
must(!core.fmt2Atualizavel(canonico, null).ok, '④ e pedido sem formato também');

// ── ⑤ a Function usa o núcleo, e grava a mescla ─────────────────────────────
const IDX = fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw/index.js'), 'utf8');
must(/_configAtiva\.fmt2Atualizavel\(t\.fmt2, patch\.fmt2\)/.test(IDX),
  '⑤ a Function pergunta ao núcleo, com o documento FRESCO da transação');
must(/t\.fmt2 = _fmt2Mesclado;/.test(IDX), '⑤ ⛔ e grava a mescla conferida, nunca `patch.fmt2` cru');
must(/if \(_configAtiva\.igual\(t\[key\], patch\[key\]\)\) \{ delete patch\[key\]; return; \}/.test(IDX),
  '⑤ campo estrutural IGUAL ao gravado sai do pedido — ordem de chave não é mudança');
must(/_recusados\.push\(key\)/.test(IDX) && /recusado: ' \+ _recusados\.join/.test(IDX),
  '⑤ ⭐ e a recusa DIZ QUAIS campos foram recusados — "a chave já existe" sozinho não dá pra depurar');

// ── ⑥ ordem de chave não é mudança (a causa real da recusa em produção) ─────
const revirado = { eliminatoria: { roundBounds: canonico.eliminatoria.roundBounds.slice(), endTime: '23:00', endDate: '2026-11-12' }, classificatoria: { rodadas: 1, grupos: 4 } };
must(core.igual(canonico, revirado),
  '⑥ ⛔ o MESMO conteúdo com as chaves em outra ordem é IGUAL — foi isto que recusava o save');
must(core.fmt2Atualizavel(canonico, revirado).ok, '⑥ e por isso ele passa pela trava');
must(!core.igual({ a: [1, 2] }, { a: [2, 1] }), '⑥ mas em ARRAY a ordem é conteúdo — [1,2] ≠ [2,1]');
must(core.igual(undefined, null), '⑥ ausente e nulo contam como a mesma coisa');
must(!core.igual({ a: 1 }, { a: 1, b: 2 }), '⑥ campo a mais é diferença de verdade');

// ── ⑦ `roundBounds` é CALENDÁRIO, não estrutura (o campo que a recusa nomeou) ──
{
  const ini = IDX.indexOf('const _CONFIG_ESTRUTURAL = new Set([');
  const fim = IDX.indexOf(']);', ini);
  const estrutural = IDX.slice(ini, fim);
  must(!/'roundBounds'/.test(estrutural),
    '⑦ ⛔ `roundBounds` saiu da lista de ESTRUTURAIS — ele move prazo, não recria rodada');
  ['format', 'sport', 'fmt2', 'gruposCount', 'swissRounds'].forEach((k) => {
    must(estrutural.indexOf("'" + k + "'") > 0, '⑦ e `' + k + '` continua lá — esse sim redesenha a chave');
  });
  const ativa = IDX.slice(IDX.indexOf('const _CONFIG_FASE_ATIVA'), IDX.indexOf(']);', IDX.indexOf('const _CONFIG_FASE_ATIVA')));
  must(/'roundBounds'/.test(ativa),
    '⑦ ⭐ e dentro de `phases` ele SEMPRE foi editável — era essa a contradição que travava o save');
}

console.log('✅ ' + ok + ' asserções — prazo se corrige com a chave no ar, formato continua trancado');

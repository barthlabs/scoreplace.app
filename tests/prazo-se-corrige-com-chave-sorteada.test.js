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
must(/_estruturais\.length === 1 && _estruturais\[0\] === 'fmt2'/.test(IDX),
  '⑤ a exceção vale só quando `fmt2` é o ÚNICO estrutural do pedido — outro campo derruba tudo');

console.log('✅ ' + ok + ' asserções — prazo se corrige com a chave no ar, formato continua trancado');

'use strict';
/* ⛔ PARTE QUE NÃO CHEGOU NÃO VIRA LISTA VAZIA — E NÃO SE GRAVA POR CIMA DO QUE EXISTE.
 *
 * Quando um campo pesado sai do documento (`_semPesados`), ele passa a morar numa
 * SUBCOLEÇÃO e volta por uma busca separada. Entre o documento chegar e a subcoleção chegar,
 * o objeto em memória tem a parte **truncada ou ausente** — e nesse intervalo dois desenhos
 * comuns viram destruição silenciosa:
 *
 *   ① o ACESSOR que "garante" a lista: `if (!Array.isArray(t.woClaims)) t.woClaims = []`.
 *      Ele inventa vazio, e a partir daí toda leitura responde "não há W.O. nenhum".
 *   ② a GRAVAÇÃO: `dividir` grava fielmente o que recebeu, então salvar esse objeto
 *      substitui a subcoleção inteira pelo pedaço. Sem erro, sem aviso, sem nada na tela.
 *
 * ⭐ A MÁQUINA QUE SABE DIZER ISSO JÁ EXISTIA e ninguém a consultava na escrita:
 * `_marcaPartesQueFaltam` compara `_nPartes[x]` com o que o objeto tem em mãos. Ela alimenta
 * a TELA desde a 2.0.124 e nunca alimentou a GRAVAÇÃO — rede que cobre o desenho e não cobre
 * a escrita. [[feedback_rede_que_cobre_o_rerender_nao_cobre_o_primeiro]]
 *
 * ⚠️ POR QUE ISTO ENTRA ANTES DE PRECISAR. MEDIDO em 13/set/2026, nos 61 torneios: hoje só
 * `participants`, `matches` e `opponentHistory` estão fora do documento (41 torneios), e
 * `checkedIn`, `woClaims`, `woLog` e `categoryNotifications` estão fora em **ZERO**. Mas os
 * quatro JÁ ESTÃO em `PESADOS` esperando a migração — e no dia em que um torneio os marcar,
 * quatro escritores do cliente (wo-claim, wo-log, categorias, sorteio) passam a poder apagar
 * o rastro de W.O. de um evento inteiro. A porta vem ANTES de o campo sair do documento.
 * [[project_dividir_exige_todo_escritor_ciente]] · [[project_porta_unica_de_escrita_cf]]
 *
 * ⛔ E O GUARDA É UM SÓ, na gravação — não quatro remendos, um por escritor. Remendo por
 * escritor deixa o quinto descoberto no dia em que ele nascer.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const raiz = path.join(__dirname, '..');
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };

console.log('\n──── parte que não chegou não vira lista vazia ────\n');

/* ── ① A MÁQUINA DE CONTAR, RODANDO DE VERDADE ────────────────────────────── */
const STORE = fs.readFileSync(path.join(raiz, 'js/store.js'), 'utf8');
const iM = STORE.indexOf('window._marcaPartesQueFaltam = function');
const W = {};
vm.runInNewContext(STORE.slice(iM, STORE.indexOf('\n};', iM) + 3),
  { window: W, Array, Object, String });

const completo = () => ({
  _semPesados: ['woClaims'], _nPartes: { woClaims: 3 },
  woClaims: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
});
const truncado = () => ({ _semPesados: ['woClaims'], _nPartes: { woClaims: 3 }, woClaims: [] });
const parcial = () => ({ _semPesados: ['woClaims'], _nPartes: { woClaims: 3 }, woClaims: [{ id: 'a' }] });
const vazioDeVerdade = () => ({ _semPesados: ['woClaims'], _nPartes: { woClaims: 0 } });

must(W._marcaPartesQueFaltam(completo()) === false, '① parte COMPLETA: nada falta');
must(W._marcaPartesQueFaltam(truncado()) === true, '① ⭐ parte AUSENTE (0 de 3): falta');
must(W._marcaPartesQueFaltam(parcial()) === true, '① ⭐ parte PARCIAL (1 de 3): falta');
must(W._marcaPartesQueFaltam(vazioDeVerdade()) === false,
  '① ⛔ vazio DE VERDADE (0 de 0) NÃO é falta — senão o guarda travaria torneio sem W.O. nenhum');
must(W._marcaPartesQueFaltam({ woClaims: [] }) === false,
  '① ⛔ torneio NÃO dividido passa reto — o guarda não pode custar nada a quem não usa partes');

/* ── ② O GUARDA NA GRAVAÇÃO — e ele RECUSA A GRAVAÇÃO INTEIRA ─────────────── */
const DB = fs.readFileSync(path.join(raiz, 'js/firebase-db.js'), 'utf8');
const codigo = DB.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
const iG = codigo.indexOf('if (_fora && _fora.length && typeof window._marcaPartesQueFaltam');
must(iG > 0, '② o guarda existe em `saveTournament`');
const guarda = codigo.slice(iG, codigo.indexOf('var _sbPartesSave', iG));

must(/JSON\.parse\(JSON\.stringify\(cleanData\)\)/.test(guarda),
  '② ⭐ ele sonda uma CÓPIA — marcar `_faltamPesados` no objeto real o gravaria no banco');
must(/throw _erro/.test(guarda),
  '② ⭐ e RECUSA a gravação inteira — salvar o resto produziria documento coerente e MENTIROSO');
must(/_faltaOQue/.test(guarda),
  '② o erro diz QUAIS partes faltam, não só que faltam');
must(/_captureException/.test(guarda),
  '② e a recusa é reportada — silêncio aqui é o defeito que ela veio impedir');

/* ── ③ ele vem ANTES de `dividir` ─────────────────────────────────────────── */
must(codigo.indexOf('window._tSplit.dividir') > iG,
  '③ ⭐ o guarda roda ANTES de `dividir` — depois já seria tarde, a parte truncada já teria virado escrita');

/* ── ④ O ACESSOR DO W.O. PARA DE INVENTAR VAZIO ───────────────────────────── */
const WO = fs.readFileSync(path.join(raiz, 'js/views/wo-claim.js'), 'utf8');
const woCod = WO.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');
const iA = woCod.indexOf('function _claims(t)');
const acessor = woCod.slice(iA, woCod.indexOf('function _claimsProntos', iA) > 0
  ? woCod.indexOf('function _claimsProntos', iA) : woCod.indexOf('function _activeClaimFor', iA));
must(/window\._parteFalta\(t, 'woClaims'\)\) return null/.test(acessor),
  '④ ⭐ o acessor devolve `null` ("não sei") quando a parte não chegou');
must(/if \(!cs\) return null;/.test(woCod),
  '④ ⭐ e quem lê trata `null` como "não sei" — nunca como "não tem"');
must(/showNotification\(/.test(WO.slice(WO.indexOf('window._woOpenClaim'))),
  '④ abrir o painel com a lista a caminho AVISA, em vez de mostrar "nenhum W.O."');

/* ── ⑤ a rede que expira DIZ que expirou ──────────────────────────────────── */
must(/rede de ' \+ campo \+ ' NÃO se aplica/.test(DB),
  '⑤ ⭐ a rede que recupera W.O. concorrente lê o DOCUMENTO — quando o campo sair de lá, ela avisa em vez de virar no-op mudo');

/* ── ⑥ CONTROLE: o guarda tem dentes ─────────────────────────────────────── */
/* ⚠️ Remoção pela FATIA EXATA que as asserções ② leem, não por regex de "até a chave".
 * Minha primeira versão usou `[\s\S]*?\n    \}\n` e não casou nada — o controle passava
 * verde afirmando ter removido o guarda que continuava lá. Controle que não controla é pior
 * que controle nenhum: ele assina embaixo. */
const semGuarda = codigo.replace(guarda, '');
must(semGuarda.length < codigo.length,
  '⑥ o controle de fato removeu a fatia do guarda (' + (codigo.length - semGuarda.length) + ' caracteres)');
/* ⚠️ E o marcador do controle tem de ser EXCLUSIVO do guarda. Usei `throw _erro` e ele
 * sobrevivia: existe outro `throw _erro` no mesmo arquivo. Marcador compartilhado num
 * controle faz o controle dizer "não removi" quando removeu — ou, pior, o contrário. */
must(!/_marcaPartesQueFaltam\(_sonda\)/.test(semGuarda) && !/recuso gravar/.test(semGuarda),
  '⑥ ⭐ e sem ela as asserções ② iriam vermelhas — o portão mede o que diz medir');

console.log('\n✅ ' + ok + ' verificações');

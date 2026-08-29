/* TORNEIO NOVO NASCE NO FORMATO NOVO (2.0.106)
 * node tests/torneio-novo-nasce-inteiro.test.js
 *
 * Depois que o Confra foi dividido, o caminho novo passou a ser exercitado por 1 torneio
 * contra 38. ⛔ Caminho que é exceção APODRECE: mudança futura quebra o raro em silêncio,
 * porque a suíte e o uso real martelam o comum. E a exceção ser justo o torneio ao vivo
 * com 148 pessoas é o pior arranjo possível.
 *
 * ⭐ E nascer dividido é o caso MAIS SEGURO que existe: torneio novo não tem jogo nenhum,
 * então não há o que mover nem o que perder. Ele já sorteia direto no lugar certo.
 *
 * ⚠️ O DETALHE QUE FAZ ISSO NÃO QUEBRAR A TELA: "documento sem jogo" é ambíguo — pode ser
 * "ainda não sorteou" (zero jogos MESMO) ou "dividido e a tela não buscou". Os dois pintam
 * vazio e só um é honesto. `_nJogos` desfaz o empate.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const _R = require('./recorte.js');   // recorta pelo CONSTRUTO, nunca por tamanho fixo
const ROOT = path.join(__dirname, '..');
let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const store = fs.readFileSync(path.join(ROOT, 'js', 'store.js'), 'utf8');
const db = fs.readFileSync(path.join(ROOT, 'js', 'firebase-db.js'), 'utf8');
const cf = fs.readFileSync(path.join(ROOT, 'functions-autodraw', 'index.js'), 'utf8');

// ── ① a criação põe o marcador ──────────────────────────────────────────────
const i = store.indexOf('tourData = Object.assign({');
ok(i > 0, 'o caminho de CRIAÇÃO existe (separado do de edição)');
const criacao = _R.ateOFim(store, i);
/* ⛔⛔ REVERTIDO NO MESMO DIA, com o app quebrado na mão do dono:
 *   "não mostra os meus jogos apenas a classificação" · "jogos já jogados perdidos".
 * (No banco nada se perdeu — conferido contra os dois backups: 115 jogos, 72 placares,
 * 148 inscritos, idênticos. O que quebrou foi a TELA não conseguir montar.)
 *
 * A CAUSA: eu construí a REDE do ouvinte — que enxerta os jogos que já estão em MEMÓRIA —
 * e nunca construí a BUSCA. No PRIMEIRO carregamento não há memória, e o carregamento
 * inicial vem pelo ouvinte, não pelo `loadTournamentById` que eu tinha ensinado a montar.
 * Torneio chega sem jogos e ninguém vai buscar.
 * ⛔ E eu tinha escrito essa rede chamando-a de "a rede antes do salto", convencido de que
 * cobria o caso. Ela cobre o RE-render. Não cobre o primeiro.
 *
 * ⭐ O QUE ESTE TESTE TRANCA AGORA: torneio novo nasce INTEIRO. Só volta a nascer dividido
 * quando existirem (1) o ouvinte da subcoleção do torneio ABERTO e (2) a busca no primeiro
 * carregamento — provados num torneio de verdade, não em teste. */
/* ⭐⭐ RELIGADO EM 28/ago/2026 — e o que mudou não foi opinião, foram as TRÊS condições
 * que a própria reversão exigiu, conferidas NO CAMINHO:
 *   (1) o ouvinte das partes fora do documento existe (2.0.123);
 *   (2) ⭐ a BUSCA do 1º carregamento vive DENTRO do `startRealtimeListener` — o caminho
 *       que estava descoberto. É a asserção ③ abaixo que tranca isso;
 *   (3) prova em torneio DE VERDADE: 41 divididos em produção, a Confra ao vivo entre eles.
 * ⛔ A distinção que importa: em 26/ago a função de montar EXISTIA e estava certa; o que
 * faltava era alguém chamá-la no caminho por onde o torneio entra na tela. Por isso ③ não
 * pergunta "a função existe?" e sim "o OUVINTE a chama?". */
/* ⛔⛔ REVERTIDO PELA SEGUNDA VEZ (28/ago/2026), minutos depois de publicar — e agora
 * na CRIAÇÃO: o dono criou um torneio e ele NÃO CHEGOU AO BANCO ("criei o torneio mas não
 * consegui salvar 8 placeholders"; medido: 41 antes, 41 depois). A reversão escreveu, com
 * honestidade, "a causa ainda não foi diagnosticada".
 *
 * ⭐⭐ RELIGADO NA 2.1.42, COM A CAUSA NA MÃO — e ela não era a divisão:
 *   `ReferenceError: S is not defined`, 6× às 15:20 UTC, 14 minutos depois do deploy da
 *   2.1.32. Em `firebase-db.saveTournament`, `(S.PESADOS || [...])` usava um `S` declarado
 *   1.100 linhas abaixo, dentro de OUTRA função. Aquele ramo SÓ roda quando o doc tem
 *   `_semPesados` — invisível enquanto torneio novo nascia inteiro, fatal no dia em que
 *   passou a nascer dividido. E o catch daquele bloco relança de propósito, então a falha
 *   era total e muda.
 * ⭐ ACHADO NO SENTRY, não relendo o código. Eu tinha revertido às cegas; o erro estava
 *   gravado com o carimbo de hora colado no deploy. [[feedback_measure_dont_declare_fixed]]
 *
 * ⚠️ E A LIÇÃO ANTERIOR CONTINUA VALENDO: as três condições que eu conferi eram todas
 * sobre LER um torneio dividido; nenhuma cobria CRIAR. A asserção ⑤ abaixo é a que faltava
 * — ela EXECUTA o ramo do save que quebrou, em vez de olhar o objeto criado. */
/* ⛔⛔⛔ REVERTIDO PELA TERCEIRA VEZ (28/ago, 22:35) — e agora com PERDA DE DADO MEDIDA:
 *     _nPartes = { participants: 8 }   ← o doc DIZ que há 8 morando fora
 *     participants no doc: 0           ← saíram (correto)
 *     subcoleção `inscritos`: 0        ← ⛔ NÃO CHEGARAM
 * Os 8 placeholders do dono existiam só na memória do navegador.
 *
 * ⭐ E A CAUSA É ESTRUTURAL, não mais um descuido: o cliente NÃO pode escrever
 * subcoleção (a regra nega, por desenho). Quem escreve é a CF `tournamentMirror` — que
 * DERIVA DO DOCUMENTO e PULA o que está em `_semPesados`, justamente pra não apagar a
 * subcoleção ao ver o doc vazio. Quem tira do doc é o cliente; quem gravaria fora está
 * proibido de olhar. O dado cai no vão. Nos 41 migrados não aparece porque a subcoleção
 * foi escrita ANTES, com o doc cheio — só quebra em quem NASCE dividido.
 *
 * ⚠️ RELIGAR exige uma PEÇA NOVA, não outra conferência: uma porta de escrita no servidor
 * que receba os inscritos e os grave na subcoleção. Até lá, nasce inteiro. */
ok(!/_semPesados: \['matches', 'participants'/.test(criacao),
  '⛔ torneio novo NÃO nasce dividido — os inscritos não chegariam à subcoleção');

// ── ⑤ A CAUSA, travada: a CF do espelho PULA o que saiu do documento ──────────────
/* Esta asserção é o que faltava nas três tentativas. Ela não pergunta "nasce dividido?" —
 * pergunta POR QUE não pode nascer ainda. No dia em que existir a porta de escrita, é ela
 * que vai apontar o que mudou. */
ok(/_pulados\s*=\s*Array\.isArray\(depois\._semPesados\)/.test(cf),
  '⛔ a CF do espelho deriva o que PULAR do marcador do documento');
ok(/_pula\('participants'\)/.test(cf),
  '⛔⛔ e ela PULA `participants` quando ele saiu do doc — logo NINGUÉM o escreve na ' +
  'subcoleção se ele nunca esteve lá. É isto que impede nascer dividido.');

// ── ③ ⛔ A CONDIÇÃO QUE FALTAVA: o OUVINTE busca o que falta ────────────────
/* Esta é a asserção que não existia em 26/ago, e a ausência dela custou produção. Não
 * basta a montagem existir: ela tem que ser disparada por `startRealtimeListener`, que é
 * por onde o torneio entra na tela no PRIMEIRO carregamento. Testar a função sozinha foi
 * exatamente o que deixou a suíte verde enquanto o app quebrava. */
const _iOuv = store.indexOf('startRealtimeListener(');
ok(_iOuv > 0, 'o ouvinte em tempo real existe');
const _ouvinte = store.slice(_iOuv, store.indexOf('\n  pararDeOuvir', _iOuv));
ok(/_montaPesadosQueFaltam\(/.test(_ouvinte),
  '⛔⛔ o OUVINTE dispara a busca do que falta — sem isto, torneio dividido chega vazio e ninguém vai buscar');
ok(/_enxertaJogos|_semPesados/.test(_ouvinte),
  'e ele também enxerta o que já está em memória (a rede do re-render)');

// ── ② o número é mantido por quem grava ─────────────────────────────────────
ok(/_nJogos = \(pDepois\.matches \|\| \[\]\)\.length/.test(cf),
  '⭐ a CF atualiza a contagem toda vez que grava (senão ela envelhece e mente)');
ok(/_nJogos = \(_p\.matches \|\| \[\]\)\.length/.test(db),
  'e o cliente também, no mesmo lugar em que divide');

// ── ③ a rede usa o número em vez de adivinhar — rodando a função REAL ──────
const i0 = store.indexOf('function _enxertaJogos(');
const corpo = store.slice(i0, store.indexOf('\n    }', i0) + 6);
const ctx = { store: { tournaments: [] } }; vm.createContext(ctx);
vm.runInContext(corpo + '\nthis.f = _enxertaJogos;', ctx);
const enxerta = ctx.f;

// a rede em si CONTINUA correta e vale a pena manter provada — ela é pré-requisito de
// quando isto voltar. `_nJogos` desfaz o empate entre "não sorteou" e "não carregou".
const novo = { id: 'n1', _semPesados: ['matches'], _nJogos: 0, rounds: [], matches: [] };
const r1 = enxerta(JSON.parse(JSON.stringify(novo)), null);
ok(!r1._faltamPesados,
  '⭐ com _nJogos:0, "não tem jogo" não é confundido com "não carregou"');

const cheio = { id: 'c1', _semPesados: ['matches'], _nJogos: 12,
                rounds: [{ round: 1, matches: [] }], matches: [] };
const r2 = enxerta(JSON.parse(JSON.stringify(cheio)), null);
ok(r2._faltamPesados === true,
  '⛔ mas torneio com 12 jogos fora e nada em memória É — "não carregou" ≠ "não tem"');

const r3 = enxerta(JSON.parse(JSON.stringify(cheio)),
  { id: 'c1', rounds: [{ round: 1, matches: [{ id: 'm1' }] }] });
ok(!r3._faltamPesados && r3.rounds[0].matches.length === 1,
  'e com memória, os jogos voltam e a marca sai');

const velho = { id: 'v1', _semPesados: ['matches'], rounds: [{ round: 1, matches: [] }], matches: [] };
ok(enxerta(JSON.parse(JSON.stringify(velho)), null)._faltamPesados === true,
  '⚠️ documento SEM `_nJogos` (dividido antes desta versão) cai no comportamento antigo, que é o seguro');

console.log((fail ? '✗' : '✓') + ' torneio-novo-nasce-inteiro: ' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);

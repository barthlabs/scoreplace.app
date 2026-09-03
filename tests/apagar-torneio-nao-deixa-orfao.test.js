/* Apagar torneio apaga TUDO dele — node tests/apagar-torneio-nao-deixa-orfao.test.js
 *
 * Regra do dono (01/ago/2026, sobre o sandbox): _"os dados do SB devem ficar apenas enquanto
 * existe o SB. ao apagar o SB deve apagar tudo relativo a ele para não persistir."_
 *
 * MEDIDO NO BANCO antes do conserto: `collectionGroup('results')` tinha 211 documentos de
 * placar e SÓ 60 eram de torneio vivo — 151 órfãos, 85 deles de sandboxes já apagados. A
 * causa era literal: `deleteTournament` era UMA LINHA que apagava só o doc do torneio, e o
 * Firestore não apaga subcoleção junto com o pai. Órfão não é dado inerte: ele responde à
 * consulta por uid e reaparece no histórico das pessoas (foi o "(SB) Torneio de Férias" na
 * ficha da Lucia Helena — ver tests/jogo-so-com-placar.test.js).
 *
 * A ORDEM é o coração do teste: subcoleção PRIMEIRO, doc do torneio DEPOIS. A regra do
 * Firestore autoriza escrita em `results` pelo torneio PAI (`parentT()`); com o pai já
 * apagado a limpeza toma permission-denied e os filhos ficam INALCANÇÁVEIS pra sempre.
 * Apagar o pai primeiro não é "ordem diferente", é o bug.
 *
 * Ver project_game_counts_only_with_score_partner_opponent, project_sandbox_tournament.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { window, sandbox } = require('./headless.js');

vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8'),
  sandbox, { filename: 'firebase-db.js' });
const DB = window.FirestoreDB;

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }
function eq(a, b, m) { ok(a === b, m + ' — esperado ' + JSON.stringify(b) + ', veio ' + JSON.stringify(a)); }

// ── Firestore de mentira que ANOTA A ORDEM das operações ──────────────────────
function fakeDb(conteudo, opts) {
  opts = opts || {};
  const log = [];
  const restante = JSON.parse(JSON.stringify(conteudo));   // { 'tid/sub': nDocs }
  const api = {
    _log: log,
    _restante: restante,
    batch: function () {
      const alvos = [];
      return {
        delete: function (ref) { alvos.push(ref); },
        commit: async function () {
          alvos.forEach(function (r) {
            log.push('del ' + r.chave);
            restante[r.chave] = Math.max(0, (restante[r.chave] || 0) - 1);
          });
        }
      };
    },
    collection: function (nome) {
      return {
        doc: function (id) {
          return {
            delete: async function () { log.push('del doc ' + nome + '/' + id); },
            collection: function (sub) {
              const chave = id + '/' + sub;
              return {
                limit: function (n) {
                  return {
                    get: async function () {
                      if (opts.falha && opts.falha === sub) throw new Error('permission-denied');
                      log.push('get ' + chave);
                      const qtd = Math.min(n, restante[chave] || 0);
                      const docs = [];
                      for (let i = 0; i < qtd; i++) docs.push({ ref: { chave: chave } });
                      return { empty: qtd === 0, size: qtd, forEach: function (f) { docs.forEach(f); } };
                    }
                  };
                }
              };
            }
          };
        }
      };
    }
  };
  return api;
}

(async function () {
  console.log('\n▸ apagar leva as subcoleções junto');
  {
    DB.db = fakeDb({ 'tour_x/results': 12, 'tour_x/letzplayScans': 3 });
    await DB.deleteTournament('tour_x');
    eq(DB.db._restante['tour_x/results'], 0, 'nenhum placar sobrou');
    eq(DB.db._restante['tour_x/letzplayScans'], 0, 'nenhum scan sobrou');
    const log = DB.db._log;
    ok(log.indexOf('del doc tournaments/tour_x') >= 0, 'o torneio foi apagado');
    // ⭐ 2.1.79 — ESTA ASSERÇÃO ESTAVA INVERTIDA, e ficou verde por 30 dias.
    // Ela exigia que o cliente apagasse `discoveryFeed/{id}`. O cliente TENTAVA — e a
    // produção NEGAVA em 100% das vezes: `firestore.rules` tem um único bloco pra essa
    // coleção, `allow write: if false`, e `delete` está dentro de `write`. O `catch (e) {}`
    // mudo engolia o permission-denied, e este teste — que dirige um Firestore de MENTIRA,
    // cujo `delete()` só ANOTA e não sabe negar — carimbava a limpeza como feita.
    // Mock de cliente NÃO valida autorização de Rules; nunca validou. O índice é do
    // SERVIDOR (ver o bloco "quem apaga o índice de descoberta é o SERVIDOR", abaixo).
    ok(log.indexOf('del doc discoveryFeed/tour_x') < 0,
      'o cliente NÃO tenta apagar discoveryFeed (a regra nega `write`; tentar só gerava catch mudo)');
    // ORDEM: o último delete de subcoleção acontece ANTES do delete do torneio.
    const ultimoFilho = Math.max(log.lastIndexOf('del tour_x/results'), log.lastIndexOf('del tour_x/letzplayScans'));
    const paiIdx = log.indexOf('del doc tournaments/tour_x');
    ok(ultimoFilho >= 0 && ultimoFilho < paiIdx,
      'subcoleções PRIMEIRO, torneio DEPOIS (com o pai apagado a regra nega a limpeza pra sempre)');
  }

  console.log('▸ subcoleção grande: apaga em lotes até esvaziar');
  {
    DB.db = fakeDb({ 'tour_big/results': 950, 'tour_big/letzplayScans': 0 });
    await DB.deleteTournament('tour_big');
    eq(DB.db._restante['tour_big/results'], 0, 'os 950 placares foram embora (lotes de 400)');
    const gets = DB.db._log.filter(function (l) { return l === 'get tour_big/results'; }).length;
    ok(gets >= 3, 'precisou de mais de um lote (' + gets + ' páginas) — 400 é o teto do batch');
  }

  console.log('▸ torneio sem subcoleção nenhuma não quebra');
  {
    DB.db = fakeDb({ 'tour_zero/results': 0, 'tour_zero/letzplayScans': 0 });
    await DB.deleteTournament('tour_zero');
    ok(DB.db._log.indexOf('del doc tournaments/tour_zero') >= 0, 'apaga o torneio normalmente');
  }

  console.log('▸ falha na limpeza NÃO impede o torneio de sumir (mas é barulhenta)');
  {
    DB.db = fakeDb({ 'tour_err/results': 5, 'tour_err/letzplayScans': 0 }, { falha: 'results' });
    let gritou = false;
    const antes = window._error;
    window._error = function () { gritou = true; };
    await DB.deleteTournament('tour_err');
    window._error = antes;
    ok(DB.db._log.indexOf('del doc tournaments/tour_err') >= 0,
      'o organizador clicou em Apagar e o torneio sumiu');
    ok(gritou, 'e o erro da limpeza foi registrado (não é silencioso)');
  }

  console.log('▸ quem apaga o índice de descoberta é o SERVIDOR, e está escrito');
  {
    /* ⭐ 2.1.79 — A OUTRA METADE DA ASSERÇÃO INVERTIDA LÁ EM CIMA.
     * Tirar a tentativa do cliente só é seguro se a remoção EXISTIR do outro lado. E,
     * como no bloco de `matches`, "o servidor limpa" não pode ser promessa: tem que
     * estar escrito no gatilho. Por FONTE, que é o que este arquivo alcança.
     * ⛔ O QUE ESTE TESTE **NÃO** PROVA, e não pode fingir que prova: que a regra nega o
     * cliente em tempo de execução. O Firestore daqui é de mentira — o `delete()` dele
     * ANOTA e pronto, não conhece autorização nenhuma. Regra se prova dirigindo as rules
     * reais no emulador (é o que as suítes `rules-*` fazem). Aqui se prova TEXTO. */
    const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    const _i = rules.indexOf('match /discoveryFeed/{');
    const blocoFeed = _i >= 0 ? rules.slice(_i, rules.indexOf('\n    }', _i)) : '';
    ok(/allow write:\s*if false/.test(blocoFeed),
      'a regra de discoveryFeed nega `write` ao cliente (é POR ISSO que ele não tenta)');

    const cf = fs.readFileSync(path.join(__dirname, '..', 'functions', 'index.js'), 'utf8');
    // ⛔ ANCORA NO `exports.` e no FIM do gatilho — as duas lições do bloco de `matches`:
    // o nome solto aparece em comentário, e janela de N caracteres quebra quando alguém
    // acrescenta um comentário.
    const gatilho = function (nome) {
      const a = cf.indexOf('exports.' + nome + ' =');
      if (a < 0) return '';
      const b = cf.indexOf('\nexports.', a + 10);
      return cf.slice(a, b > a ? b : undefined);
    };
    const sync = gatilho('syncDiscoveryFeed');
    const purge = gatilho('purgeTournamentCopies');

    ok(/onDocumentWritten/.test(sync) && /"tournaments\/\{tid\}"/.test(sync),
      'syncDiscoveryFeed escuta o documento do torneio');
    ok(/collection\("discoveryFeed"\)/.test(sync) && /\.delete\(\)/.test(sync),
      'e apaga o doc do feed quando o torneio some ou deixa de ser público');

    ok(/onDocumentDeleted/.test(purge) && /"tournaments\/\{tid\}"/.test(purge),
      'purgeTournamentCopies dispara no APAGAR do torneio');
    ok(/collection\("discoveryFeed"\)\.doc\(tid\)\.delete\(\)/.test(purge),
      'e apaga discoveryFeed/{tid} INCONDICIONALMENTE (a rede que cobre o guard de isPublic do outro)');

    // ⛔ E o cliente não pode voltar a tentar por outro caminho.
    const cliente = fs.readFileSync(path.join(__dirname, '..', 'js', 'firebase-db.js'), 'utf8');
    ok(!/collection\(['"]discoveryFeed['"]\)\s*\.\s*doc\([^)]*\)\s*\.\s*delete\(/.test(cliente),
      'js/firebase-db.js não tem writer de discoveryFeed (o natimorto da 1.6.78 não volta)');
  }

  console.log('▸ a lista de subcoleções é a das regras do Firestore');
  {
    const rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    // começa DEPOIS da linha do próprio `match /tournaments/{tournamentId}` — senão o
    // primeiro casamento do regex é o pai, não uma subcoleção.
    const _ini = rules.indexOf('match /tournaments/{tournamentId}');
    const dentro = rules.slice(rules.indexOf('\n', _ini));
    const subs = [];
    const re = /match \/(\w+)\/\{/g;
    let m;
    while ((m = re.exec(dentro.slice(0, dentro.indexOf('\n    }')))) !== null) subs.push(m[1]);
    /* ⭐ 2.0.96 — QUEM LIMPA DEPENDE DE QUEM ESCREVE.
     * Este teste nasceu quando toda subcoleção era do CLIENTE, e a regra era simples:
     * está nas regras ⇒ tem que estar na lista de limpeza do cliente.
     * A Fase 2 trouxe subcoleção que o cliente NÃO ESCREVE (`allow write: if false`) —
     * `tournaments/{id}/matches` é espelhada pelo gatilho `tournamentMirror` (admin SDK).
     * Pôr essa na lista do cliente não conserta nada: ele leva permission-denied.
     * Então a exigência se divide, e nenhuma das duas metades pode ficar sem dono. */
    /* ⚠️ 2.0.103 — O QUE DECIDE É QUEM PODE **APAGAR**, não quem pode escrever.
     * A fila do placar (`resultQueue`) quebrou a suposição antiga: o cliente CRIA nela
     * (é o ponto — a intenção precisa caber na fila offline dele), mas a regra nega
     * `delete`, porque o item é o RECIBO do que a pessoa mandou. Classificando por
     * "escreve?", ela caía na lista do cliente — que levaria permission-denied na hora
     * de limpar. Limpeza é sobre APAGAR. */
    const escritaNegada = function (sub) {
      const i = dentro.indexOf('match /' + sub + '/{');
      if (i < 0) return false;
      // ⚠️ janela LARGA: a regra de `matches` ganhou o comentário que explica por que a
      // escrita é negada (o cliente dispara, a CF escreve). Com 900 o `allow write: if
      // false` ficava fora do recorte e o teste dizia que a subcoleção era do cliente.
      const bloco = dentro.slice(i, i + 2600);
      const corpo = bloco.slice(0, bloco.indexOf('\n      }') + 1);
      /* ⚠️ 2.2 — a forma `allow read, write: if false` NÃO casava com `/allow write:/`, e as
       * duas subcoleções novas do avanço (`advanceReceipts`, `outbox`) foram classificadas
       * como "do cliente". O teste então exigia que ele as limpasse — coisa que ele nem pode
       * fazer, já que a mesma regra nega tudo. O classificador é que estava estreito: o que
       * importa é se o DELETE do cliente está negado, e `read, write: if false` nega. */
      return /allow (?:[a-z]+, )*write:\s*if false/.test(corpo)
          || /allow update, delete:\s*if false/.test(corpo)
          || /allow delete:\s*if false/.test(corpo);
    };
    const doServidor = [];
    subs.forEach(function (s) {
      if (escritaNegada(s)) { doServidor.push(s); return; }
      ok(DB._tournamentSubcollections.indexOf(s) >= 0,
        'subcoleção "' + s + '" das regras está na lista de limpeza (senão vira órfão novo)');
    });
    ok(subs.length >= 2, 'achou as subcoleções nas regras (' + subs.join(', ') + ')');

    // ⛔ "o servidor limpa" não pode ser promessa: tem que estar escrito no gatilho.
    if (doServidor.length) {
      const cf = fs.readFileSync(path.join(__dirname, '..', 'functions-autodraw', 'index.js'), 'utf8');
      // ⛔ ANCORA NO `exports.`, não no nome solto: a palavra aparece em COMENTÁRIO antes
      // do gatilho, e o indexOf pegava o comentário — recortando a região errada do arquivo.
      const i = cf.indexOf('exports.tournamentMirror');
      // ⛔ ANCORA NO FIM DO GATILHO, não numa janela de N caracteres: um comentário a mais
      // empurra o código pra fora e o teste 'falha' sem que nada tenha regredido.
      const _fim = i >= 0 ? cf.indexOf('\nexports.', i + 10) : -1;
      const trecho = i >= 0 ? cf.slice(i, _fim > i ? _fim : undefined) : '';
      ok(/after && event\.data\.after\.exists\) \? .* : null|apagado/.test(trecho),
        'o gatilho trata o torneio APAGADO (é ele que limpa o que o cliente não pode)');
      ok(/lote\.delete\(d\.ref\)/.test(trecho),
        'e apaga os documentos do espelho de verdade — senão "o servidor limpa" é só promessa');
      doServidor.forEach(function (s) {
        ok(DB._tournamentSubcollections.indexOf(s) < 0,
          'subcoleção "' + s + '" NÃO entra na lista do cliente (ele não escreve nela; levaria permission-denied)');
      });
      /* ⛔ 2.2 — E AGORA POR NOME, que é a parte que faltava. Antes eu só exigia que o
       * gatilho TIVESSE código de apagar; ele tem, mas varria uma LISTA À MÃO — e à mão ela
       * havia esquecido QUATRO (`grupos`, `checkedIn`, `woLog`, `woClaims`), além das duas
       * novas do avanço. O teste passava e o órfão nascia igual.
       * ⚠️ E NÃO LEIO TEXTO: agora a lista do gatilho DERIVA de `_tSplit.PESADOS`, então
       * varrer o arquivo por nomes literais voltaria a mentir. Eu REPRODUZO a derivação
       * contra o mesmo vendor que a CF carrega, e comparo com o que as regras exigem. */
      const _split = require(path.join(__dirname, '..', 'functions-autodraw', 'vendor', 'tournament-split-core.js'));
      const _iL = trecho.indexOf('.concat([');
      const _extras = _iL >= 0 ? trecho.slice(_iL, trecho.indexOf('])', _iL)) : '';
      const _efetiva = (_split.PESADOS || []).map(function (n) { return _split.colecaoDaParte(n); })
        .concat((_extras.match(/'([a-zA-Z]+)'/g) || []).map(function (x) { return x.replace(/'/g, ''); }));
      /* ⛔ E CONFIRO OS DOIS LADOS. Reproduzir a derivação prova que os NOMES estão certos,
       * mas não que o gatilho use essa fonte: troquei `_tSplit.PESADOS` por `['inscritos']`
       * lá dentro e este teste continuou VERDE. Então exijo também a expressão. */
      ok(/_tSplit\.PESADOS\.map\(/.test(trecho) && /_tSplit\.colecaoDaParte\(/.test(trecho),
        '⭐ o gatilho DERIVA de _tSplit.PESADOS (traduzido por colecaoDaParte), não de lista à mão');
      ok(_efetiva.length >= 10, 'a lista do gatilho deriva da fonte de verdade (' + _efetiva.length + ' coleções)');
      doServidor.forEach(function (s) {
        ok(_efetiva.indexOf(s) >= 0,
          '⭐ e o gatilho varre "' + s + '" — quem o cliente não pode apagar, o servidor apaga');
      });
    }
  }


  console.log('\n' + (fail ? '✗ ' + fail + ' falha(s), ' : '✓ ') + pass + ' asserções');
  process.exit(fail ? 1 : 0);
})();

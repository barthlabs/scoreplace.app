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
 * A remoção da raiz agora é uma callable autenticada. Só depois da confirmação o cliente
 * remove a cópia visual; `purgeTournamentCopies` é o único responsável por limpar filhos.
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

(async function () {
  console.log('\n▸ apagar só confirma depois da callable do servidor');
  {
    DB.db = {};
    let chamada = null;
    DB._callFn = async function (nome, payload) { chamada = { nome, payload }; return { deleted: true }; };
    await DB.deleteTournament('tour_x');
    eq(chamada && chamada.nome, 'deleteTournament', 'o cliente dispara a callable certa');
    eq(chamada && chamada.payload && chamada.payload.tournamentId, 'tour_x', 'e envia somente o id');
  }

  console.log('▸ erro do servidor chega à tela; apagar não vira sumiço local');
  {
    DB.db = {};
    DB._callFn = async function () { throw new Error('permission-denied'); };
    let falhou = false;
    try { await DB.deleteTournament('tour_err'); } catch (e) { falhou = /permission-denied/.test(e.message); }
    ok(falhou, 'a rejeição da CF não é engolida pelo cliente');
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
    const deletar = cliente.slice(cliente.indexOf('async deleteTournament'), cliente.indexOf('\n  async loadAllTournaments'));
    ok(/_callFn\('deleteTournament'/.test(deletar), 'o cliente só dispara `deleteTournament` no servidor');
    ok(!/\.delete\(\)/.test(deletar), 'e não mantém uma exclusão direta como queda');

    const apagar = gatilho('deleteTournament');
    ok(/onCall/.test(apagar) && /_isTournamentOrgCaller/.test(apagar),
      'a CF exige autenticação e autoridade do organizador pelo documento fresco');
    ok(/await ref\.delete\(\)/.test(apagar), 'a CF só responde após apagar a raiz');

    const tela = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment.js'), 'utf8');
    const ui = tela.slice(tela.indexOf('window.deleteTournamentFunction'), tela.indexOf('// Liga active toggle'));
    ok(ui.indexOf('deleteTournament(tId).then') < ui.indexOf('tournaments.splice'),
      'a tela remove da memória somente depois da confirmação da CF');
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

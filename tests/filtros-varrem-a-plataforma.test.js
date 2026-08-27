/* OS FILTROS VARREM A PLATAFORMA — e o NÚMERO tem que dizer a mesma coisa que a LISTA.
 *
 * POR QUE ESTE ARQUIVO EXISTE (16/ago/2026). Ordem do dono, em três mensagens seguidas:
 *   "o todos nao esta mostrando todos os torneios na plataforma. aqui deve ser todos os
 *    que tem na plataforma, mesmo encerrados, mesmo ocultos e mesmo de outros
 *    organizadores."
 *   "inscricoes abertas tambem de outros organizadores e mesmo ocultos."
 *   "encerrados, mesmo de outros organizadores."
 * E, sobre onde os ocultos aparecem:
 *   "os ocultados devem ficar em ocultados colapsavel."
 *   "se eu ocultei um torneio ele deve ficar no ocultados mesmo que em andamento,
 *    mesmo que encerrado."
 *
 * A CAUSA ORIGINAL: os três filtros liam pools do USUÁRIO (organizados / participando /
 * abertos-pra-você). Esses saem de `visible`, que é escopado ao uid pelo listener em
 * tempo real E já vem com os ocultos removidos (v2.8.40). Num app com 16 torneios o
 * pill dizia "Todos 3" — não era contagem errada, era a FONTE errada.
 *
 * ⚠️ E A LIÇÃO QUE ESTE ARQUIVO EXISTE PRA TRAVAR: na 1.8.89 eu troquei a fonte da
 * LISTA e deixei a dos CONTADORES. O dono continuou vendo "Todos 3" e "Inscrições
 * abertas 1" depois do conserto, porque o número no pill vinha de `allUnique.length` e
 * `abertosParaVoce.length` — variáveis diferentes, mesma fonte velha. Consertar metade
 * de um par lista/contador é pior que não consertar: a tela passa a se contradizer.
 * Por isso as asserções abaixo cobrem OS DOIS LADOS, sempre.
 *
 * As asserções rodam o CÓDIGO REAL extraído do dashboard.js — não uma réplica. Réplica
 * já deixou suíte verde com o arquivo revertido.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } }

console.log('\n== Filtros varrem a plataforma ==');

// ── extrai o código real dos pools e dos contadores ──────────────────────────
function fatia(marcaIni, marcaFim) {
  const i = src.indexOf(marcaIni);
  if (i < 0) return null;
  const j = src.indexOf('\n', src.indexOf(marcaFim, i));
  if (j < 0) return null;
  return src.slice(i, j);
}
const codPools = fatia('  const _poolPlataforma = (function () {', 'const _poolVisivel');
const codCont = fatia('  const _todosCount =', 'const _encerradosPillCount');

ok(!!codPools, 'os dois pools (_poolPlataforma / _poolVisivel) existem no dashboard.js');
ok(!!codCont, 'os contadores dos pills (_todosCount / _abertosCount / _encerradosPillCount) existem');

if (codPools && codCont) {
  // base espelhando a produção medida em 16/ago: 11 abertos, 3 encerrados, 2 ativos.
  const mk = (id, st, oculto) => ({ id, status: st, _oculto: !!oculto });
  const base = [];
  for (let i = 1; i <= 11; i++) base.push(mk('ab' + i, 'open', i >= 8));      // 4 ocultos
  for (let i = 1; i <= 3; i++) base.push(mk('enc' + i, 'finished', i === 3)); // 1 oculto
  for (let i = 1; i <= 2; i++) base.push(mk('at' + i, 'active', i === 2));    // 1 oculto

  const _allVisibleRaw = base.slice();
  // discovery REPETE a lista inteira de propósito: em produção um torneio público do
  // próprio usuário chega pelos dois caminhos, e sem dedup a plataforma "dobraria".
  const _discoveryRaw = base.slice();
  const _hidSet = {};
  base.filter(t => t._oculto).forEach(t => { _hidSet[t.id] = 1; });
  const _isOpenEnrollment = t => !!(t && t.status === 'open');
  // ⭐ 2.0.96 — a fatia dos contadores agora inclui o do CÍRCULO (a lista padrão deixou de
  // ser a plataforma inteira). As dependências dele entram aqui: o teste continua sobre os
  // PILLS, e o que ele protege é justamente que os pills sigam contando a PLATAFORMA.
  const _dashLocaisFavoritos = () => [];
  const _dashAmigos = () => ({});
  const window = { _ehDoMeuCirculo: () => true };

  const r = eval('(function(){' + codPools + '\n' + codCont + '\nreturn {' +
    'plataforma:_poolPlataforma.length, visivel:_poolVisivel.length,' +
    'todos:_todosCount, abertos:_abertosCount, encerrados:_encerradosPillCount};})()');

  ok(r.plataforma === 16, 'o pool da plataforma tem os 16 (dedup segura a repetição do discovery) — deu ' + r.plataforma);
  ok(r.visivel === 10, 'o pool da LISTA tira os 6 ocultos — deu ' + r.visivel);

  // os NÚMEROS dos pills: a plataforma inteira, ocultos incluídos.
  ok(r.todos === 16, 'o TOTAL da plataforma segue 16, e é ele que o botão Explorar mostra — deu ' + r.todos);
  // ⛔ o total NÃO pode passar a contar o círculo: o dono pediu o número da plataforma
  // sempre visível ("na dashboard deve aparecer o número total de torneios na plataforma").
  ok(/_todosCount = _poolPlataforma\.length/.test(src),
     'o total continua saindo do pool da PLATAFORMA, não do círculo');
  ok(/_circuloCount = _poolPlataforma\.filter/.test(src),
     'e o círculo tem contagem PRÓPRIA, medida sobre a mesma plataforma');
  ok(r.abertos === 11, 'pill "Inscrições abertas" inclui os abertos OCULTOS (11) — deu ' + r.abertos);
  ok(r.encerrados === 3, 'pill "Encerrados" inclui o encerrado OCULTO (3) — deu ' + r.encerrados);

  // e o par não pode divergir em sentido: o número nunca é MENOR que a lista, senão
  // haveria card na tela que o contador nega.
  ok(r.todos >= r.visivel, 'o número do pill nunca é menor que a lista que ele rotula');
}

// ── fiação: os pills têm que USAR os contadores novos ────────────────────────
// Sem isto, alguém "conserta" só o cálculo e o pill segue lendo a variável velha —
// que é literalmente o bug da 1.8.89.
(function () {
  /* ⭐ 2.0.96 — O PILL PADRÃO CONTA O CÍRCULO; O TOTAL FOI PRO BOTÃO EXPLORAR.
   * A lista padrão deixou de ser a plataforma inteira (ordem do dono: "apenas torneios
   * organizados ou participando, ou em locais favoritos, ou de amigos"). Com isso o
   * rótulo "Todos" passaria a MENTIR — mostraria 4 de 39 —, então ele virou "Pra Você"
   * e conta o círculo. O número da PLATAFORMA continua na tela, no botão Explorar, que
   * é onde o dono pediu que ele ficasse sempre visível.
   * O que este bloco protege segue de pé: o número exibido tem que vir da variável
   * CALCULADA, não de um `allUnique.length` recalculado na mão — que é o bug da 1.8.89. */
  /* ⛔ 2.1.13 — OS PILLS SAÍRAM DA TELA (ordem do dono: "elimine essa sessao. vamos
   * distribuir isso depois - apenas o que for relevante"). As três asserções que cobravam
   * a FIAÇÃO deles (_fStyle lendo _circuloCount/_abertosCount/_encerradosPillCount) não
   * têm mais objeto — mas a LIÇÃO que elas guardavam continua valendo pra quando a
   * informação for redistribuída, então ela virou o par abaixo:
   *   (a) os contadores seguem CALCULADOS — a maquinaria não foi apagada junto com o
   *       layout, senão redistribuir viraria reescrever;
   *   (b) e ninguém pode voltar a contar por `allUnique.length` na mão (o bug da 1.8.89),
   *       que é a asserção logo adiante e segue de pé. */
  /* ⛔ 2.1.23 — OS FILTROS VOLTARAM, e a asserção anterior ("saíram da hero box") virou
   * mentira. Eles tinham sumido com o quadro de números (2.1.13, "elimine essa sessao") e
   * ficaram SEM PORTA na interface — organizados/participando/favoritos/encerrados eram
   * fatias inalcançáveis. O dono mandou trazer de volta ("faça 1").
   * ⚠️ Mas em outra FORMA: pílula de uma linha, não o card com emoji grande e número em
   * 1.3rem que ocupava a hero box. Devolver igual seria desfazer o pedido anterior — o que
   * ele quis foi o ACESSO, não o painel. É isso que as duas asserções abaixo separam. */
  ok(/_fStyle\('todos', '📋', _circuloCount/.test(src),
    'o filtro padrão existe e lê o contador do círculo');
  // ⚠️ medir DENTRO do _fStyle: o `font-size:1.3rem` ainda existe no _statPill (os números
  // sociais, órfãos desde a 2.1.13 e guardados pro "distribuir depois"). Olhar o arquivo
  // inteiro acusaria o vizinho.
  const _iF = src.indexOf('const _fStyle = (key, emoji, count, label)');
  const _corpoF = src.slice(_iF, src.indexOf('};', _iF));
  ok(!/font-size:1\.3rem/.test(_corpoF) && /border-radius:999px/.test(_corpoF),
    '⛔ e voltou como PÍLULA, não como o card grande da hero box (o que o dono mandou eliminar)');
  ok(/const _circuloCount = /.test(src) && /const _abertosCount = /.test(src) && /const _encerradosPillCount = /.test(src),
    '⭐ mas os contadores CONTINUAM calculados — a redistribuição religa uma porta nova, não reescreve a lógica');
  ok(/window\._applyDashFilter = /.test(src) || /_applyDashFilter/.test(src),
    'e o aplicador de filtro segue existindo pra ser religado');
  /* ⛔ 2.1.11 — O TOTAL DEIXOU DE SAIR DE `_todosCount`. Esta asserção cobrava
   * `${_todosCount}` no botão, e o número que ele produzia era FALSO: `_poolPlataforma`
   * é o que a dashboard conseguiu carregar (publicDiscovery, assíncrono e filtrado por
   * memberUids), não a plataforma. MEDIDO em 27/ago: 39 públicos no banco, o pill dizia 3.
   * Ordem do dono: _"tira a porra do 3. coloca o numero total ali ou deixa sem numero se
   * nao for possivel"_. Agora vem do total que a tela #todos-torneios apurou de verdade —
   * e, sem esse valor, o botão fica sem número (a segunda opção que ele deu). */
  ok(/\$\{_totalPlataformaHtml\}/.test(src),
    'o número do botão Explorar vem do total apurado pela tela, não do pool da dashboard');
  ok(!/\$\{_todosCount\}/.test(src),
    '⛔ e o contador do pool (que dizia 3) não voltou pro botão');
  ok(!/allUnique\.length[^;]*_fStyle|_fStyle\([^)]*allUnique\.length/.test(src),
    'nenhum pill voltou a contar por `allUnique.length` (o bug da 1.8.89)');
  // (as duas asserções de fiação dos pills "abertos"/"encerrados" saíram com eles — ver a
  // nota acima; o que elas protegiam virou o par contadores-vivos + sem-recount-à-mão)
  ok(!/_fStyle\('todos',\s*'📋',\s*allUnique\.length/.test(src),
    'a fonte velha (allUnique.length) não voltou pro pill "Todos"');
  ok(!/_fStyle\('abertos',\s*'🗓️',\s*abertosParaVoce\.length/.test(src),
    'a fonte velha (abertosParaVoce.length) não voltou pro pill de abertos');
})();

// ── a LISTA não repete os ocultos; eles vivem na seção própria ───────────────
(function () {
  ok(/curFilter === 'abertos'\) filtered = _poolVisivel\.filter\(_isOpenEnrollment\)/.test(src),
    'a lista de "abertos" usa o pool SEM ocultos (eles vão pra seção)');
  ok(/filtered = _poolVisivel\.filter\(t => t && t\.status === 'finished'\)/.test(src),
    'a lista de "encerrados" usa o pool SEM ocultos');
  ok(/_poolVisivel\.forEach\(t => \{ if \(t && !seen\.has\(t\.id\)\)/.test(src),
    'a lista de "todos" completa com o pool SEM ocultos');
})();

// ── a seção "Torneios ocultados" mostra TODOS os ocultos, sempre ─────────────
// Ordem explícita: "mesmo que em andamento, mesmo que encerrado". Cheguei a filtrá-la
// pelo filtro ativo e estava errado — quem ocultou quer achar o torneio ali sem ter
// que adivinhar em qual filtro ele reaparece.
(function () {
  const i = src.indexOf('🙈 Torneios ocultados');
  ok(i > 0, 'a seção "Torneios ocultados" existe');
  if (i > 0) {
    const trecho = src.slice(Math.max(0, i - 1800), i + 400);
    ok(/hiddenTournaments\.length\s*\+\s*'\)/.test(trecho) || /\(' \+ hiddenTournaments\.length/.test(trecho),
      'a seção conta TODOS os ocultos (hiddenTournaments), sem recorte por filtro');
    ok(!/curFilter === 'encerrados'\) _ocultos = _ocultos\.filter/.test(src),
      'a seção NÃO é filtrada pelo filtro ativo (ordem do dono: aparece em qualquer estado)');
    ok(!/if \(curFilter === 'todos' \|\| curFilter === 'abertos' \|\| curFilter === 'encerrados'\) \{\s*var _jaNaLista/.test(src),
      'a seção não é suprimida nos filtros explícitos');
  }
})();

// ── ENCERRADO NUNCA DIVIDE LISTA COM EM ANDAMENTO ───────────────────────────
// Ordem do dono: "os encerrados nao devem aparecer com os em andamento (mesmo na
// lista)." Ele viu, logo abaixo da faixa "Em andamento (1)", três cards "Encerrado".
//
// A causa era de DESENHO: a extração existia em TRÊS lugares, cada um com um gate
// próprio (o ramo "todos" gated em `encerradosCount > 0` + ausência de filtro
// secundário; o ramo "organizados/participando" com outro gate; e nenhum pro resto).
// Bastava um gate não fechar. Agora é UMA regra, antes de qualquer ramo.
(function () {
  const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');

  // 1. a extração é única e roda pra todo filtro que não seja "encerrados"
  ok(/if \(curFilter !== 'encerrados'\) \{\s*\n\s*_encerradosExtraidos = filtered\.filter/.test(dash),
    'a extração de encerrados roda pra QUALQUER filtro exceto "encerrados"');
  ok(!/curFilter === 'todos' && !curSport && !curLocation && !curFormat && encerradosCount > 0/.test(dash),
    'o gate antigo (encerradosCount > 0 + sem filtro secundário) saiu — era ele que deixava passar');

  // 2. e é UMA só: a segunda cópia (organizados/participando) não existe mais
  const extras = (dash.match(/status === 'finished'\s*\}\)\.sort\(sortByRecency\)/g) || []).length;
  ok(extras === 0, 'a segunda extração (v2.2.7, de organizados/participando) foi removida — não há duas cópias da regra');
  ok(!/_finishedSubSection/.test(dash), 'a variável da segunda seção sumiu junto (nada de decoy)');

  // 3. o recém-encerrado (<12h) CONTINUA na lista, de propósito
  ok(/_isRecentlyFinished\(t\)/.test(dash) && /12 \* 60 \* 60 \* 1000/.test(dash),
    'quem encerrou há menos de 12h segue na lista principal (janela do pódio fresco)');

  // 4. comportamento: roda a regra REAL extraída do arquivo
  const ini = dash.indexOf('  let _encerradosExtraidos = [];');
  const fim = dash.indexOf('\n', dash.indexOf('  // Pagination — show N items'));
  if (ini > 0 && fim > ini) {
    const cod = dash.slice(ini, fim);
    const agora = Date.now();
    function roda(curFilter) {
      let filtered = [
        { id: 'a1', status: 'active' },
        { id: 'e1', status: 'finished', finishedAt: new Date(agora - 40 * 24 * 3600e3).toISOString() },
        { id: 'o1', status: 'open' },
        { id: 'e2', status: 'finished', finishedAt: new Date(agora - 2 * 3600e3).toISOString() } // 2h → fica
      ];
      const _isRecentlyFinished = function (t) {
        if (!t || t.status !== 'finished') return false;
        var fa = t.finishedAt ? new Date(t.finishedAt).getTime() : 0;
        if (!fa || isNaN(fa)) return false;
        return (Date.now() - fa) < 12 * 60 * 60 * 1000;
      };
      const sortByRecency = () => 0;
      let _encerradosExtraidos = [];
      eval(cod.replace('  let _encerradosExtraidos = [];', ''));
      return { lista: filtered.map(t => t.id).join(','), secao: _encerradosExtraidos.map(t => t.id).join(',') };
    }
    const r = roda('todos');
    ok(r.lista === 'a1,o1,e2', 'na lista sobram os ativos + o recém-encerrado (deu: ' + r.lista + ')');
    ok(r.secao === 'e1', 'o encerrado antigo vai pra seção (deu: ' + r.secao + ')');
    const rOrg = roda('organizados');
    ok(rOrg.secao === 'e1', 'em "organizados" a regra vale igual — era o gate que faltava lá');
    const rEnc = roda('encerrados');
    ok(rEnc.lista.indexOf('e1') !== -1 && rEnc.secao === '',
      'no filtro "encerrados" NADA é extraído — senão a tela ficaria vazia');
  } else {
    ok(false, 'não achei o bloco da extração pra exercitar');
  }
})();

// ── O MODO LISTA MOSTRA O MESMO QUE O MODO CARDS ────────────────────────────
// Relato do dono, em modo Lista: "na lista onde estao os encerrados? deveria estar no
// colapsavel" + "essa de nenhum torneio encontrado nao deveria estar ai. esta mostrando
// torneio, como assim nenhum encontrado."
//
// Dois defeitos, os dois de ramo divergente:
//  (a) a seção de Encerrados era SUPRIMIDA no modo Lista — resíduo de antes da v2.8.81,
//      quando as bandas ainda não respeitavam o toggle. Hoje `_renderTGroup` já monta
//      lista compacta sozinho, então a supressão só sumia com os encerrados.
//  (b) o "Nenhum torneio encontrado" saía sempre que a LISTA PRINCIPAL ficava vazia —
//      mas ela pode esvaziar legitimamente com a tela cheia, porque as bandas, os
//      Encerrados e os Ocultados são renderizados FORA dela. O ramo de cards tinha uma
//      condição (incompleta); o de lista não tinha nenhuma.
(function () {
  const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');

  ok(!/\(window\._dashView === 'compact'\) \? '' : finishedSectionHtml/.test(dash),
    'a seção "Encerrados" NÃO é mais suprimida no modo Lista');
  ok(/\n    \$\{finishedSectionHtml\}/.test(dash),
    'ela é renderizada nos dois modos');

  ok(/const _telaTemOutroConteudo = !!\(runningBandHtml \|\| runningBottomHtml \|\|/.test(dash),
    'existe uma leitura única de "a tela já tem conteúdo?"');
  ok(/finishedSectionHtml \|\|\s*\n\s*\(hiddenTournaments && hiddenTournaments\.length\)\)/.test(dash),
    'ela inclui os Encerrados E os Ocultados — os dois vivem fora da lista principal');
  ok(/const _vazioHtml = _telaTemOutroConteudo \? ''/.test(dash),
    'o aviso de vazio deriva dessa leitura, em vez de cada ramo ter a sua');
  // e OS DOIS ramos consomem o mesmo `_vazioHtml`
  ok(/: _vazioHtml;/.test(dash), 'o modo cards usa _vazioHtml');
  ok(/_buildCompactList\(filtered\) \+ '<\/div>' : _vazioHtml\)/.test(dash),
    'o modo lista usa o MESMO _vazioHtml (antes não tinha condição nenhuma)');
})();


// ── BLOCO FECHADO NÃO SE MONTA (v1.8.94) ────────────────────────────────────
// Relato do dono no app NATIVO: "fica lenta, tudo demora a responder" — toques no
// hambúrguer sem efeito, "depois de varios cliques abre". Não era travamento: era o
// WebView ocupado derrubando toque.
//
// MEDIDO (harness isolado, mesma base): a dashboard montava 132 KB de HTML com 73 KB
// DENTRO de `<details>` fechados — cards construídos, inseridos e nunca vistos. E os
// MESMOS encerrados saíam duas vezes (a seção unificada da 1.8.93 colidiu com a seção
// pública da descoberta). Depois: 59 KB, 0 KB em fechados, 1 ms.
//
// A pressão veio da 1.8.89, quando "Todos" passou a varrer a plataforma inteira: a
// lista saiu de ~5 cards para 15+. A regra estava certa; o custo de desenhar tudo é que
// não estava previsto. Por isso o gate é ESTRUTURAL — protege conforme a base cresce.
(function () {
  const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');

  ok(/function _dashLazyBody\(gid, aberto, construir\)/.test(dash),
    'existe o helper que adia a montagem de bloco recolhível');
  ok(/window\._dashLazyOpen = function/.test(dash),
    'existe o hidratador que monta no primeiro ABRIR');
  ok(/data-lazy-slot/.test(dash), 'o slot vazio é marcado pra hidratação');

  // o conteúdo tem que ser uma FUNÇÃO, não string pronta — senão adia só a inserção,
  // que é a parte barata; foi o erro da primeira tentativa.
  ok(/_dashLazyBody\('enc', _abertoEnc, _montaEnc\)/.test(dash),
    'Encerrados passa uma FUNÇÃO construtora (adia a montagem, não só a inserção)');
  ok(/var _montaEnc = function \(\) \{/.test(dash),
    'a construção dos cards de Encerrados vive dentro do fechamento');
  ok(/_dashLazyBody\('ocultos',[\s\S]{0,120}?_renderTGroup\(hiddenTournaments\)/.test(dash),
    'Ocultados também só monta ao abrir');

  // e os encerrados não podem sair DUAS vezes
  ok(/_jaNaSecaoUnificada\[String\(t\.id\)\]/.test(dash),
    'a seção pública de encerrados exclui quem já está na seção unificada (eram 2 cópias)');

  // CATRACA: nenhum bloco recolhível novo pode nascer montando conteúdo pesado.
  // Conta os `<details>` que recebem _renderTGroup DIRETO (sem passar pelo lazy).
  const diretos = (dash.match(/<details[^']*'[^;]*?_renderTGroup\(/g) || []).length;
  ok(diretos === 0,
    'nenhum <details> monta grupo de cards direto — todos passam pelo lazy (achados: ' + diretos + ')');
})();


// ── TELA PRETA DEIXA DE SER UM DESFECHO POSSÍVEL (v1.8.98) ──────────────────
// Relato do dono no app nativo: "mostra a dash e tela preta. volta, ok. entra nas
// notificacoes ok, sai e volta pra dash tela preta."
//
// A CAUSA ESTRUTURAL não é o bug que lança — é o que acontece DEPOIS: o router
// ESVAZIA o #view-container e SÓ ENTÃO chama o render. Render que lança deixa o
// container vazio, e vazio no tema escuro É a tela preta. Pior: sem `catch`, o erro
// morre ali e não vai pro Sentry — por isso a investigação não achava rastro nenhum.
//
// Esta é a QUARTA encarnação de tela preta/branca no projeto, e as três anteriores
// foram consertadas cada uma no seu mecanismo. Esta trava o DESFECHO: qualquer falha
// de render, de qualquer tela, vira um aviso legível com o erro no Sentry.
(function () {
  const router = fs.readFileSync(path.join(ROOT, 'js', 'router.js'), 'utf8');

  // o esvaziamento continua (é ele que evita conteúdo velho vazando entre telas)...
  ok(/viewContainer\.innerHTML = '';/.test(router), 'o router segue limpando o container ao navegar');
  // ...mas agora o render inteiro está protegido
  const iSwitch = router.indexOf('switch (view) {');
  const iTry = router.lastIndexOf('try {', iSwitch);
  ok(iTry > 0 && iSwitch - iTry < 1200,
    'o switch de renderização está DENTRO de um try (o catch é o que impede a tela vazia)');
  ok(/\} catch \(_erroRender\) \{/.test(router), 'existe o catch do render');

  const iCatch = router.indexOf('} catch (_erroRender) {');
  const bloco = router.slice(iCatch, iCatch + 2600);
  ok(/_captureException\(_erroRender/.test(bloco),
    'a falha é REPORTADA ao Sentry — antes era engolida, e foi por isso que não havia rastro');
  ok(/tags: \{ view:/.test(bloco), 'o relatório diz QUAL tela falhou');
  ok(/viewContainer\.innerHTML =/.test(bloco),
    'o container é PREENCHIDO com um aviso — nunca fica vazio');
  ok(/Não consegui desenhar esta tela/.test(bloco), 'o aviso diz o que aconteceu, em português');
  ok(/window\.location\.reload\(\)/.test(bloco) && /#dashboard/.test(bloco),
    'e oferece caminho de volta (tentar de novo / início)');
  // a ordem importa: reportar ANTES de desenhar
  ok(bloco.indexOf('_captureException') < bloco.indexOf('viewContainer.innerHTML ='),
    'reporta ANTES de desenhar — se o próprio aviso falhar, o erro original já está no Sentry');
  // e o desenho do aviso também é guardado, senão ele mesmo poderia deixar a tela vazia
  const trechoDesenho = bloco.slice(bloco.indexOf('viewContainer.innerHTML ='));
  ok(/catch \(_e3\)/.test(trechoDesenho), 'o desenho do aviso também é protegido');
})();


// ── "IR PARA O TORNEIO" — UM POR GRUPO, NAS DUAS SEÇÕES (v1.8.98) ───────────
// Ordem do dono: "um botao ir para o torneio aqui em cada grupo... tem que ter 1 botao
// por grupo. na mesma linha do titulo/torneio, mas alinhado na direita. fazer a mesma
// coisa nos seus ultimos resultados".
// Ele nasce em `_grupoHeadHtml`, que é a FONTE ÚNICA do cabeçalho das DUAS seções
// (Novidades e Seus últimos resultados) — por isso o pedido "a mesma coisa nos últimos
// resultados" saiu de graça, em vez de virar uma segunda montagem que divergiria.
(function () {
  const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
  ok(/function _grupoHeadHtml\(grupo, tName, cor, attr, inline, tId\)/.test(dash),
    'o cabeçalho compartilhado recebe o id do torneio');
  ok(/href="#bracket\/' \+ String\(tId\)/.test(dash),
    'o botão leva pra chave/classificação do torneio');
  ok(/Ir para o torneio/.test(dash), 'o rótulo é "Ir para o torneio"');
  ok(/margin-left:auto/.test(dash.slice(dash.indexOf('var _btn = tId'), dash.indexOf('var _btn = tId') + 700)),
    'o botão é empurrado pra DIREITA na mesma linha');
  ok(/var _btn = tId\s*\n?\s*\?/.test(dash),
    'sem id do torneio NÃO desenha botão — link pra lugar nenhum é pior que nenhum link');
  // os DOIS pontos de uso passam o id
  // v1.9.64: o 4º argumento (atributos) deixou de ser literal — passou a carregar o
  // `data-sp-extra` da prévia da linha fechada. O INVARIANTE aqui é o ÚLTIMO argumento:
  // o id do torneio, sem o qual o botão "Ir para o torneio" não é desenhado.
  ok(/_grupoHeadHtml\(g\.group, g\.tName, g\.color, [^,]+, false, g\.tId\)/.test(dash),
    '"Seus últimos resultados" (agrupado) passa o id');
  ok(/u\.tName, u\.color, '', true, u\.tId/.test(dash),
    '"Seus últimos resultados" (avulso) passa o id');
  ok(/_grupoHeadHtml\(g\.grupo, g\.tName, '#fbbf24', 'data-nov-head="1"[^,]*, false, g\.tId\)/.test(dash),
    '"Novidades no seu torneio" passa o id');
})();


// ── "IR PARA O TORNEIO" CAI NO GRUPO CLICADO (v1.8.99) ─────────────────────
// Ordem do dono: "o ir para o torneio tem que ir com o grupo clicado no topo e nao no
// topo do torneio". A 1.8.98 mandava só `#bracket/<id>` e a chave abria no começo.
// Os boxes de grupo já tinham `data-group-box` (usado pra rolar até o SEU jogo) mas
// nenhum RÓTULO — não havia como escolher um grupo específico.
(function () {
  const dash = fs.readFileSync(path.join(ROOT, 'js', 'views', 'dashboard.js'), 'utf8');
  const br = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');

  // normalização é FONTE ÚNICA: a dashboard escreve "R1 GRUPO B" e a chave "R1 Grupo B"
  const m = br.match(/window\._grpKey = function[\s\S]*?\n\};/);
  ok(!!m, 'existe a normalização canônica de rótulo de grupo (_grpKey)');
  if (m) {
    const win = {};
    eval(m[0].replace('window._grpKey', 'win._grpKey'));
    ok(win._grpKey('R1 GRUPO B') === win._grpKey('R1 Grupo B'),
      'a chave ignora CAIXA — a dashboard mostra em maiúsculas e a chave não');
    ok(win._grpKey('R2 Grupo Ú') === 'r2 grupo u', 'a chave ignora ACENTO');
    ok(win._grpKey('  R1   GRUPO   b  ') === 'r1 grupo b', 'a chave colapsa espaços');
  }

  // os TRÊS renders de grupo carregam o rótulo (Rei/Rainha por t.matches, Fase de
  // Grupos, e Rei/Rainha por t.rounds) — faltando um, aquele formato não seria alcançado
  const marcados = (br.match(/data-group-label=/g) || []).length;
  ok(marcados >= 3, 'os 3 renders de box de grupo carregam data-group-label (achados: ' + marcados + ')');

  ok(/sessionStorage\.setItem\(\\'sp_scrollToGroup/.test(dash) || /sp_scrollToGroup/.test(dash),
    'o botão da dashboard grava o grupo pedido');
  // ⚠️ Estas três cobram a REGRA, não o nome da variável: em 1.9.111 a escolha do alvo
  // virou UMA função (_alvoDeEntrada) usada pelo scroll e pelo laço que o re-afirma — eram
  // duas cópias — e o `_pedido` local sumiu no caminho. A prioridade em si (grupo pedido >
  // meu grupo > meu jogo) é cobrada de ponta a ponta, com DOM, em
  // tests/entrar-no-torneio-cai-no-meu-grupo.test.js.
  ok(/sessionStorage\.getItem\('sp_scrollToGroup'\)/.test(br),
    'a chave lê o grupo pedido');
  ok(/\[data-group-label="/.test(br),
    'e rola pro box daquele rótulo');
  // ⛔ 2.1.22 — e ele MONTA os lotes adiados antes de desistir. Sem isto a regra existia e
  // não funcionava: acima de 6 grupos os que não são o seu nascem como marcador (2.0.88),
  // então o box do grupo PEDIDO nem estava no DOM e o alvo caía no grupo do usuário.
  ok(/_chaveMontaTudo/.test(br),
    'e monta os grupos adiados quando o pedido ainda não está no documento');
  // ⚠️ grupo inexistente NÃO pode travar no topo — cai nas regras seguintes
  ok(/encontrado \(re-sorteio, fase avançada\)/i.test(br),
    'grupo não encontrado cai na regra antiga em vez de ficar no topo sem explicação');
  // v1.9.111 (ordem do dono): entrar no torneio cai no TOPO DO SEU GRUPO, mesmo sem jogo
  // pendente. Os três renders de box de grupo têm de MARCAR o grupo de quem está olhando.
  ok((br.match(/data-my-group="1"/g) || []).length >= 3,
    'os 3 renders marcam o grupo do usuário (data-my-group) pro scroll de entrada');
  ok(/\[data-my-group="1"\]/.test(br), 'o alvo de entrada procura o grupo do usuário');
  // ── v1.9.0: a rolagem se CORRIGE até o alvo estar no lugar certo ──────────
  // Relato do dono: "na segunda vez vai certo, mas na primeira fica mais abaixo".
  // MEDIDO no harness: com o recuo (--scroll-anchor) medido pequeno no instante do
  // scroll — a barra sticky de busca ainda não existia — o grupo pousava 1210px fora
  // e NADA mais se movia. Depois: erro 0.
  ok(/var _reafirmar = function/.test(br), 'existe o laço que re-afirma a rolagem');
  ok(/getPropertyValue\('--scroll-anchor'\)/.test(br),
    'ele compara o topo do alvo com o recuo ATUAL');
  ok(/var _erro = Math\.abs\(_topo - _recuo\);/.test(br),
    'a régua é o ERRO de posição, não a estabilidade');
  // ⚠️ a distinção que fez o conserto funcionar: parar por "não se mexeu mais" deixava
  // o alvo parado no lugar ERRADO, que é exatamente o sintoma relatado.
  ok(/_erro <= 3 && _ultimo !== null/.test(br),
    'só conta como estável quando ESTÁ no lugar certo E parou de mexer');
  // a chave é consumida quando o LAÇO termina — não no timeout de 1400ms, que rodaria
  // no meio da correção e faria o laço cair na regra antiga (outro grupo).
  const iRemove = br.indexOf("sessionStorage.removeItem('sp_scrollToGroup')");
  const iLaco = br.indexOf('var _reafirmar = function');
  ok(iRemove > iLaco, 'a chave é consumida DENTRO do laço, ao terminar');
  ok(!/_goMine\('auto'\);\s*\n\s*try \{ sessionStorage\.removeItem\('sp_scrollToGroup'\)/.test(br),
    'o timeout de 1400ms NÃO apaga mais a chave (apagar ali derrubaria a correção em curso)');
})();


// ── UM ÚNICO MECANISMO POSICIONA A ROLAGEM (v1.9.1) ────────────────────────
// Relato do dono: "foi para o lugar certo e dai pulou pra ca".
// A 1.9.0 deixou DOIS mecanismos escrevendo o mesmo scroll: o laço `_reafirmar` e um
// passe fixo em 1400ms. Quando o laço terminava cedo (alvo já certo em 3 leituras) ele
// CONSUMIA a chave; o passe de 1400ms então rodava SEM a chave, caía na regra antiga
// (próximo jogo do usuário) e desfazia a posição correta.
// A regra: quem posiciona é UM só. O passe fixo sobrou apenas pra soltar a supressão
// do soft-refresh — e agora espera o laço terminar, senão um re-render no meio da
// correção mataria o alvo.
(function () {
  const br = fs.readFileSync(path.join(ROOT, 'js', 'views', 'bracket.js'), 'utf8');
  const chamadas = (br.match(/_goMine\(/g) || []).length;
  ok(chamadas === 2,
    'só DUAS chamadas de _goMine: a inicial (smooth) e a do laço (corretiva). Achadas: ' + chamadas);
  ok(!/setTimeout\(function \(\) \{\s*\n\s*_goMine\('auto'\);/.test(br),
    'o passe fixo de 1400ms NÃO rola mais — era ele que desfazia a posição certa');
  ok(/setTimeout\(function \(\) \{ window\._suppressSoftRefresh = false; \}, 3400\);/.test(br),
    'a supressão do soft-refresh só é solta DEPOIS do laço (3400ms > teto do laço)');
  // o teto do laço tem que caber dentro da supressão, senão um re-render entra no meio
  const mTeto = br.match(/_voltas < (\d+)/);
  ok(!!mTeto && (220 + Number(mTeto[1]) * 100) <= 3400,
    'o teto do laço cabe dentro da janela de supressão (laço ~' + (mTeto ? 220 + Number(mTeto[1]) * 100 : '?') + 'ms < 3400ms)');
})();

console.log('\n' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);

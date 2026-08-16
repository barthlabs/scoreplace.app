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

  const r = eval('(function(){' + codPools + '\n' + codCont + '\nreturn {' +
    'plataforma:_poolPlataforma.length, visivel:_poolVisivel.length,' +
    'todos:_todosCount, abertos:_abertosCount, encerrados:_encerradosPillCount};})()');

  ok(r.plataforma === 16, 'o pool da plataforma tem os 16 (dedup segura a repetição do discovery) — deu ' + r.plataforma);
  ok(r.visivel === 10, 'o pool da LISTA tira os 6 ocultos — deu ' + r.visivel);

  // os NÚMEROS dos pills: a plataforma inteira, ocultos incluídos.
  ok(r.todos === 16, 'pill "Todos" conta a plataforma (16), não o pool do usuário — deu ' + r.todos);
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
  ok(/_fStyle\('todos',\s*'📋',\s*_todosCount,/.test(src),
    'o pill "Todos" lê _todosCount (e não allUnique.length)');
  ok(/_fStyle\('abertos',\s*'🗓️',\s*_abertosCount,/.test(src),
    'o pill "Inscrições abertas" lê _abertosCount (e não abertosParaVoce.length)');
  ok(/_encerradosPillCount\s*>\s*0\s*\?\s*_fStyle\('encerrados',\s*'🏆',\s*_encerradosPillCount,/.test(src),
    'o pill "Encerrados" lê _encerradosPillCount');
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

console.log('\n' + pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);

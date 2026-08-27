/* #todos-torneios — A PLATAFORMA INTEIRA, E O QUE FICA DE FORA (leva 2.1.10)
 *
 * Ordem do dono (27/ago/2026): _"esse botao explorar deveria abrir um tela com todos,
 * absolutamente todos os torneios (apenas os dados basicos como nome, modalidade, local
 * etc) com a barra de ordenar e filtrar"_ — depois de constatar que _"como está é
 * absolutamente inutil que nao mostra nada alem do que ja esta na tela"_. E: _"no explorar
 * podemos indicar tambem x privados ocultados"_.
 *
 * ⚠️ O DIAGNÓSTICO, medido em 27/ago e não suposto: o banco tem 40 resumos — 39 públicos,
 * 1 privado, 0 sandbox. O pill dizia 3. A consulta nunca foi o problema: rodada no
 * navegador contra produção, `tournaments_summary` com isPublic==true devolve os 39. O que
 * chegava torto era o POOL da dashboard (`publicDiscovery`: carga assíncrona no login,
 * filtrada por memberUids, desenhada antes de terminar). Por isso a tela BUSCA, não relê o
 * cache — uma tela chamada "todos" não pode depender de algo que às vezes tem 3.
 *
 * ⛔ O QUE ESTE TESTE MAIS GUARDA É O QUE **NÃO** APARECE:
 *   · torneio PRIVADO não entra na lista — só é CONTADO. A regra do Firestore deixa
 *     qualquer logado ler qualquer resumo, então listar era tecnicamente possível; quem
 *     marcou como não público não espera estar numa vitrine. Se um dia a lista passar a
 *     incluí-lo, isto acusa antes de virar vazamento.
 *   · SANDBOX (o torneio de teste do dev) não entra nem na lista nem na contagem.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── #todos-torneios: a plataforma inteira ────');

// ── um Firestore de mentira que responde às DUAS consultas da tela ────────────
function mkDb(docs) {
  const lidos = { publicos: 0, privados: 0 };
  return {
    lidos: lidos,
    collection(nome) {
      if (nome !== 'tournaments_summary') throw new Error('coleção inesperada: ' + nome);
      let val = null;
      const q = {
        where(campo, op, v) { if (campo !== 'isPublic') throw new Error('filtro inesperado'); val = v; return q; },
        limit() { return q; },
        async get() {
          const sel = docs.filter(d => !!d.isPublic === !!val);
          if (val) lidos.publicos++; else lidos.privados++;
          return { size: sel.length, forEach: (cb) => sel.forEach(d => cb({ id: d.id, data: () => d })) };
        }
      };
      return q;
    }
  };
}

function mkSandbox(docs, logado) {
  const els = {};
  const sandbox = {
    console: console,
    setTimeout: setTimeout,
    Promise: Promise,
    Date: Date,
    document: {
      getElementById: (id) => els[id] || null,
      querySelectorAll: () => []
    }
  };
  sandbox.window = sandbox;
  sandbox.window._safeHtml = (s) => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  sandbox.window._spCor = (c) => c;
  sandbox.window._t = (k) => k;
  sandbox.window._formatDisplayName = (f) => (f === 'Liga' ? 'Pontos Corridos' : String(f || ''));
  sandbox.window._renderBackHeader = () => '<header></header>';
  sandbox.window._filterBarState = {};
  sandbox.window._inscritosFilterBar = () => '<div id="fbwrap-todosTorneios"></div>';
  sandbox.window.FirestoreDB = { db: mkDb(docs) };
  sandbox.window.AppStore = { currentUser: logado ? { uid: 'u1' } : null };
  sandbox.window.location = { hash: '#todos-torneios' };
  sandbox._els = els;
  vm.createContext(sandbox);
  // ⛔ A REGRA DE "INSCRIÇÕES ABERTAS" ENTRA PELO ARQUIVO REAL (waitlist-core.js), nunca
  // por uma réplica no teste. É a fonte única desde a 1.8.40 — nascida porque a mesma
  // pergunta tinha SEIS respostas no app. Um stub aqui deixaria a suíte verde sobre uma
  // sétima resposta, que é exatamente a falha que este projeto já pagou.
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'waitlist-core.js'), 'utf8'),
    sandbox, { filename: 'waitlist-core.js' });
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'todos-torneios.js'), 'utf8'),
    sandbox, { filename: 'todos-torneios.js' });
  return sandbox;
}

// container de mentira: guarda o html e registra os ids que a tela procura
function mkContainer(sandbox) {
  const c = { innerHTML: '' };
  Object.defineProperty(c, 'innerHTML', {
    get() { return this._h || ''; },
    set(v) {
      this._h = v;
      ['todos-torn-conta', 'todos-torn-lista'].forEach(id => {
        const m = v.indexOf('id="' + id + '"');
        sandbox._els[id] = (m === -1) ? null : { innerHTML: '', textContent: '' };
      });
    }
  });
  return c;
}

// ⚠️ `hasDraw:false` é DE PROPÓSITO em quem deve ficar aberto: no resumo é ele que responde
// "já sorteou?" (ver a nota em _phaseDrawDone). Sem o campo, o resumo não mente mais — mas
// declarar deixa o cenário explícito em vez de depender de ausência.
const BASE = [
  // ── balde 0 · INSCRIÇÕES ABERTAS (ordenadas pelo prazo: quem fecha antes vem antes) ──
  { id: 'a', name: 'Alfa Open',   sport: 'Beach Tennis', venueName: 'Clube A', format: 'Liga', status: 'open', isPublic: true, hasDraw: false, competitorsCount: 12, registrationLimit: '2099-09-01T10:00' },
  { id: 'b', name: 'Bravo Cup',   sport: 'Padel', venueName: 'Clube B', format: 'Eliminatórias Simples', status: 'open', isPublic: true, hasDraw: false, competitorsCount: 8, registrationLimit: '2099-08-10T10:00' },
  // sem prazo de inscrição → cai pro startDate; sem os dois → createdAt (a cascata do dono)
  { id: 'c', name: 'Charlie Sem Prazo', sport: 'Padel', venueName: 'Clube C', format: 'Liga', status: 'open', isPublic: true, hasDraw: false, startDate: '2099-07-01T10:00' },
  { id: 'd', name: 'Delta Só Criacao',  sport: 'Padel', venueName: 'Clube D', format: 'Liga', status: 'open', isPublic: true, hasDraw: false, createdAt: '2099-06-01T10:00' },
  // ── balde 1 · INSCRIÇÕES ENCERRADAS (torneio vivo, mas não dá pra entrar) ──
  { id: 'f', name: 'Foxtrot Fechado', sport: 'Padel', venueName: 'Clube F', format: 'Eliminatórias Simples', status: 'closed', isPublic: true, hasDraw: true, competitorsCount: 16 },
  { id: 'g', name: 'Golf Sorteado',   sport: 'Padel', venueName: 'Clube G', format: 'Eliminatórias Simples', status: 'open',   isPublic: true, hasDraw: true, competitorsCount: 16 },
  // ── balde 2 · TORNEIO ENCERRADO ──
  { id: 'z', name: 'Zulu Finals', sport: 'Beach Tennis', venueName: 'Clube Z', format: 'Liga', status: 'finished', isPublic: true, hasDraw: true, competitorsCount: 4, startDate: '2026-07-01T10:00' },
  // ── fora da vitrine ──
  { id: 'p', name: 'SEGREDO do Fulano', sport: 'Padel', venueName: 'Casa', format: 'Liga', status: 'open', isPublic: false, competitorsCount: 4 },
  { id: 's', name: 'SANDBOX do dev',    sport: 'Padel', venueName: 'Lab',  format: 'Liga', status: 'open', isPublic: true, isSandbox: true }
];

(async () => {
  // ── LOGADO: lista os públicos, conta o privado, ignora o sandbox ────────────
  const S = mkSandbox(BASE, true);
  const cont = mkContainer(S);
  S.window.renderAllTournamentsPage(cont);
  await new Promise(r => setTimeout(r, 50));

  // `pinta()` escreve a página INTEIRA em container.innerHTML; só o filtro posterior
  // escreve direto nos elementos. Por isso o html vem do container aqui.
  const vivo = (el, cont) => (el && el.innerHTML) ? el.innerHTML : cont.innerHTML;
  const html = vivo(S._els['todos-torn-lista'], cont);
  const conta = vivo(S._els['todos-torn-conta'], cont);

  ok(html.indexOf('Alfa Open') !== -1 && html.indexOf('Bravo Cup') !== -1 && html.indexOf('Zulu Finals') !== -1,
     'os 3 torneios PÚBLICOS aparecem na lista');
  ok(html.indexOf('SEGREDO') === -1,
     '⛔ torneio PRIVADO não pode ser LISTADO (ele é lido só pra contar — se vazar pro html, é vazamento)');
  ok(html.indexOf('SANDBOX') === -1,
     '⛔ o torneio de teste do dev não entra na vitrine');
  ok(/1 privado ocultado/.test(conta),
     'a contagem DIZ "1 privado ocultado" (ordem do dono: indicar quantos ficaram de fora). Veio: ' + conta);
  ok(/>7<\/b> torneios/.test(conta),
     'a conta mostra os 7 públicos (privado e sandbox fora). Veio: ' + conta.slice(0, 160));

  // ── os DADOS BÁSICOS que o dono pediu, e o nome de formato TRADUZIDO ────────
  ok(html.indexOf('Beach Tennis') !== -1, 'mostra a MODALIDADE');
  ok(html.indexOf('Clube A') !== -1, 'mostra o LOCAL');
  ok(html.indexOf('Pontos Corridos') !== -1,
     '⛔ o formato sai TRADUZIDO: t.format é "Liga" mas a tela diz "Pontos Corridos" ' +
     '(convenção do projeto — valor interno intocado, exibição pelo _formatDisplayName)');
  ok(html.indexOf('>Liga<') === -1, 'e o valor cru "Liga" não vaza pra tela');

  // ── ordenar e filtrar (a barra canônica) ───────────────────────────────────
  const st = S.window._filterBarState['todosTorneios'] || (S.window._filterBarState['todosTorneios'] = {});
  const nomesNaOrdem = () => (S._els['todos-torn-lista'].innerHTML.match(/>([A-Za-z][^<]*?)<\/span>/g) || [])
    .map(x => x.replace(/[><]|\/span/g, '').trim());

  // ── ⛔ A ORDEM PEDIDA PELO DONO: abertas → fechadas → encerrados ────────────
  // _"coloque os inscricoes abertas primeiro ordenados cronologicamente (inicio e fim das
  // inscricoes/criacao do torneio quando nao houver inicio e fim das inscricoes); depois os
  // com inscricoes encerradas; depois os torneios encerrados"_.
  const pos = (nome) => S._els['todos-torn-lista'].innerHTML.indexOf(nome);
  S.window._todosTornAplicarFiltro();
  ok(pos('Alfa Open') < pos('Foxtrot Fechado'), 'inscrições ABERTAS vêm antes das encerradas');
  ok(pos('Golf Sorteado') < pos('Zulu Finals'), 'inscrições encerradas vêm antes do torneio ENCERRADO');
  ok(pos('Zulu Finals') > pos('Alfa Open') && pos('Zulu Finals') > pos('Foxtrot Fechado'),
     'o torneio encerrado é o último de todos');

  // dentro das abertas: CRONOLÓGICO, com a cascata prazo → início → criação
  ok(pos('Delta Só Criacao') < pos('Charlie Sem Prazo'), 'cronológico: criação (jun) antes de início (jul)');
  ok(pos('Charlie Sem Prazo') < pos('Bravo Cup'), 'cronológico: início (jul) antes do prazo (ago)');
  ok(pos('Bravo Cup') < pos('Alfa Open'), 'cronológico: quem fecha a inscrição antes aparece antes');

  // ⛔ "sorteado" tem que fechar a inscrição MESMO com status 'open' — e no RESUMO isso só
  // funciona porque _phaseDrawDone passou a ler `hasDraw` (2.1.11). Antes, o resumo dizia
  // "não sorteado" pra todo mundo e Golf teria ficado no balde das abertas.
  ok(pos('Golf Sorteado') > pos('Alfa Open'),
     'torneio já sorteado sai do balde de "inscrições abertas" mesmo com status open');

  // ── a barra ordena DENTRO do balde; ela não desmancha a ordem do dono ───────
  st.sort = 'name-asc'; S.window._todosTornAplicarFiltro();
  let h = S._els['todos-torn-lista'].innerHTML;
  ok(h.indexOf('Alfa Open') < h.indexOf('Bravo Cup') && h.indexOf('Bravo Cup') < h.indexOf('Charlie Sem Prazo'),
     'A-Z ordena alfabeticamente dentro das abertas');
  ok(h.indexOf('Delta Só Criacao') < h.indexOf('Foxtrot Fechado'),
     '⛔ e mesmo em A-Z, toda aberta continua antes de qualquer fechada (o balde é primário)');
  st.sort = 'name-desc'; S.window._todosTornAplicarFiltro();
  h = S._els['todos-torn-lista'].innerHTML;
  ok(h.indexOf('Delta Só Criacao') < h.indexOf('Alfa Open'), 'Z-A inverte dentro do balde');
  ok(h.indexOf('Alfa Open') < h.indexOf('Zulu Finals'),
     '⛔ nem em Z-A o encerrado sobe pro topo — o pedido do dono vale em todos os estados');
  st.sort = 'order-asc';

  st.search = 'bravo'; S.window._todosTornAplicarFiltro();
  h = S._els['todos-torn-lista'].innerHTML;
  ok(h.indexOf('Bravo Cup') !== -1 && h.indexOf('Alfa Open') === -1, 'a busca filtra por nome');
  ok(h.indexOf('SEGREDO') === -1, '⛔ nem a busca alcança o privado');

  st.search = 'clube z'; S.window._todosTornAplicarFiltro();
  ok(S._els['todos-torn-lista'].innerHTML.indexOf('Zulu Finals') !== -1, 'a busca também acha pelo LOCAL');

  st.search = ''; st.sport = 'Padel'; S.window._todosTornAplicarFiltro();
  h = S._els['todos-torn-lista'].innerHTML;
  ok(h.indexOf('Bravo Cup') !== -1 && h.indexOf('Alfa Open') === -1, 'o filtro de modalidade encolhe a lista');
  st.sport = 'all'; st.search = '';

  // ── DESLOGADO: sem contagem de privados (a regra nega, e é certo que negue) ──
  const S2 = mkSandbox(BASE, false);
  const c2 = mkContainer(S2);
  S2.window.renderAllTournamentsPage(c2);
  await new Promise(r => setTimeout(r, 50));
  const conta2 = (S2._els['todos-torn-conta'] && S2._els['todos-torn-conta'].innerHTML) || c2.innerHTML;
  ok(conta2.indexOf('privado') === -1,
     'deslogado NÃO vê contagem de privados — a tela não promete número que não pôde apurar');
  ok(S2.window.FirestoreDB.db.lidos.privados === 0,
     'e nem tenta a consulta de privados quando não há usuário (evita um permission-denied garantido)');

  // ── a rota existe e o botão da dashboard aponta pra ela ─────────────────────
  const router = fs.readFileSync(path.join(__dirname, '..', 'js', 'router.js'), 'utf8');
  ok(/case 'todos-torneios'/.test(router), "a rota #todos-torneios está no router");
  const dash = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'dashboard.js'), 'utf8');
  ok(/hash = '#todos-torneios'/.test(dash),
     'o botão Explorar da dashboard ABRE a tela (antes só trocava o filtro da própria lista)');

  console.log(pass + ' ok, ' + fail + ' falhas');
  process.exit(fail ? 1 : 0);
})();

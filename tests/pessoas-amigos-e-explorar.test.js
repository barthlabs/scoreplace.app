/* PESSOAS: a SUA lista aqui, a descoberta em outra tela (leva 2.1.14)
 *
 * Ordem do dono (27/ago/2026): _"vamos colocar no pessoas o mesmo botao explorar que
 * criamos para os torneios com relacao às pessoas. ali o numero total de pessoas. e na
 * tela de pessoas apenas os amigos em ordem alfabetica por padrao (esta cronologica) e
 * abaixo os convites ainda nao eceitos. o explorar x, abre outra tela com a ordem
 * cronologica por padrao com sorters e filtros (como fazemos no torneio). a primeira
 * sessao tem as pessoas que jogam nos seus locais preferidos e depois em outros locais."_
 *
 * ⚠️ AS DUAS ORDENS PADRÃO SÃO OPOSTAS DE PROPÓSITO, e é a parte que mais parece
 * inconsistência sem a razão escrita: #explore é a SUA lista (procura-se um nome →
 * alfabético); #todas-pessoas é descoberta (quem apareceu por último → cronológico).
 *
 * ⛔ O CASO QUE ESTE TESTE MAIS GUARDA é o do LOCAL escrito de dois jeitos. Na base real
 * (medido 27/ago) o mesmo clube aparece como "Clube Paineiras do Morumby — Av. …" (perfil)
 * e "Clube Paineiras do Morumby, São Paulo" (torneio). Comparar string crua separaria as
 * duas metades da mesma quadra — por isso a chave vem de window._chaveLocal, a MESMA que a
 * dashboard usa pra decidir "torneio em local favorito". Uma terceira normalização aqui
 * faria duas telas discordarem sobre "é o mesmo clube?".
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── pessoas: amigos aqui, exploração na outra tela ────');

const PAINEIRAS_PERFIL  = 'Clube Paineiras do Morumby — Av. Dr. Alberto Penteado, 60';
const PAINEIRAS_TORNEIO = 'Clube Paineiras do Morumby, São Paulo';

const PESSOAS = [
  { _docId: 'u1', displayName: 'Ana Souza',  preferredLocations: [{ label: PAINEIRAS_PERFIL }],  lastSeenAt: '2026-08-20T10:00' },
  { _docId: 'u2', displayName: 'Bruno Lima', preferredLocations: [{ label: PAINEIRAS_TORNEIO }], lastSeenAt: '2026-08-25T10:00' },
  { _docId: 'u3', displayName: 'Carla Dias', preferredLocations: [{ label: 'Arena Outra — Rua X, 1' }], lastSeenAt: '2026-08-26T10:00' },
  { _docId: 'u4', displayName: 'Diego Melo', lastSeenAt: '2026-08-27T10:00' },   // sem local declarado
  { _docId: 'EU',  displayName: 'Eu Mesmo',  lastSeenAt: '2026-08-27T11:00' }
];

function mkSandbox(meusLocais) {
  const els = {};
  const sb = { console, setTimeout, Promise, Date, localStorage: (() => {
    const m = {}; return { getItem: k => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); } };
  })() };
  sb.window = sb;
  sb.document = { getElementById: id => els[id] || null, querySelectorAll: () => [], createElement: () => ({ style: {}, setAttribute(){} }), head: { appendChild(){} } };
  sb._els = els;
  sb.window._safeHtml = s => String(s == null ? '' : s).replace(/[<>&"]/g, c => ({ '<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;' }[c]));
  sb.window._spCor = c => c;
  sb.window._t = k => k;
  sb.window._renderBackHeader = () => '<header></header>';
  sb.window._filterBarState = {};
  sb.window._inscritosFilterBar = () => '<div id="fbwrap-todasPessoas"></div>';
  // ⛔ a chave de local vem do ARQUIVO REAL (dashboard.js), nunca de uma cópia aqui —
  // é o ponto que este teste existe pra proteger.
  const dash = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'dashboard.js'), 'utf8');
  const ini = dash.indexOf('  function _dashChaveLocal(v) {');
  const fim = dash.indexOf('  function _dashAmigos()');
  sb.window.AppStore = { currentUser: { uid: 'EU', preferredLocations: meusLocais } };
  vm.createContext(sb);
  vm.runInContext('(function(){' + dash.slice(ini, fim) + '})()', sb, { filename: 'chave-local' });
  // o card de pessoa é o do #explore — aqui um duplo simples, já que o real depende do DOM
  sb.window._explorePersonCard = (u) => '<div data-person-card>' + sb.window._safeHtml(u.displayName) + '</div>';
  sb.window.location = { hash: '#todas-pessoas' };   // o render aborta se a pessoa saiu da tela
  sb.window.FirestoreDB = { listInvitableUsers: async () => PESSOAS.slice() };
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'todas-pessoas.js'), 'utf8'),
    sb, { filename: 'todas-pessoas.js' });
  return sb;
}
function mkContainer(sb) {
  const c = {};
  Object.defineProperty(c, 'innerHTML', {
    get() { return this._h || ''; },
    set(v) { this._h = v; ['todas-pessoas-conta','todas-pessoas-lista'].forEach(id => {
      sb._els[id] = (v.indexOf('id="' + id + '"') === -1) ? null : { innerHTML: '', textContent: '' };
    }); }
  });
  return c;
}

(async () => {
  // ── a chave de local do app casa as DUAS grafias do mesmo clube ─────────────
  const S = mkSandbox([{ label: PAINEIRAS_PERFIL }]);
  ok(typeof S.window._chaveLocal === 'function', 'a chave de local do app está exposta (window._chaveLocal)');
  ok(S.window._chaveLocal(PAINEIRAS_PERFIL) === S.window._chaveLocal(PAINEIRAS_TORNEIO),
     '⛔ "— Av. …" e ", São Paulo" do MESMO clube têm a mesma chave (senão a quadra se parte em duas)');

  const cont = mkContainer(S);
  S.window.renderAllPeoplePage(cont);
  await new Promise(r => setTimeout(r, 60));
  const vivo = () => (S._els['todas-pessoas-lista'] && S._els['todas-pessoas-lista'].innerHTML) || cont.innerHTML;
  let h = vivo();

  // ── as duas seções, na ordem pedida ────────────────────────────────────────
  ok(/Jogam nos seus locais \(2\)/.test(h),
     'a 1ª seção junta quem joga nos MEUS locais — as duas grafias contam como um só. Veio: ' +
     (h.match(/Jogam nos seus locais \(\d+\)/) || ['(nenhuma)'])[0]);
  ok(/Em outros locais \(2\)/.test(h), 'a 2ª seção leva o resto');
  ok(h.indexOf('Jogam nos seus locais') < h.indexOf('Em outros locais'),
     'e "seus locais" vem ANTES de "outros locais"');
  ok(h.indexOf('Diego Melo') !== -1,
     '⛔ quem NÃO declarou local aparece em "outros" — 85% da base está nesse caso, e sumir ' +
     'com eles esvaziaria justamente a tela de explorar');

  // ── eu não me exploro ──────────────────────────────────────────────────────
  ok(h.indexOf('Eu Mesmo') === -1, 'o próprio usuário não aparece na lista');

  // ── o total guardado é o que a lista MOSTRA (lição da 2.1.11) ──────────────
  ok(S.localStorage.getItem('scoreplace_totalPessoas') === '4',
     'guarda o total pro botão — e é o número da própria lista, não de outra fonte. Veio: ' +
     S.localStorage.getItem('scoreplace_totalPessoas'));

  // ── ordem CRONOLÓGICA por padrão (oposta à de #explore, de propósito) ──────
  // ⚠️ A cronologia vale DENTRO de cada seção — a seção é o critério primário, igual ao
  // balde de #todos-torneios. Comparar Ana (1ª seção) com Carla (2ª) mediria a seção, não
  // a ordem; por isso os pares abaixo são intra-seção.
  ok(h.indexOf('Bruno Lima') < h.indexOf('Ana Souza'),
     'dentro de "seus locais": cronológico decrescente (Bruno 25/ago antes de Ana 20/ago)');
  ok(h.indexOf('Diego Melo') < h.indexOf('Carla Dias'),
     'dentro de "outros locais": idem (Diego 27/ago antes de Carla 26/ago)');
  ok(h.indexOf('Ana Souza') < h.indexOf('Carla Dias'),
     '⛔ e a SEÇÃO manda sobre a data: quem joga nos meus locais vem antes, mesmo sendo mais antigo');

  // ── a barra ordena e filtra ────────────────────────────────────────────────
  const st = S.window._filterBarState['todasPessoas'] || (S.window._filterBarState['todasPessoas'] = {});
  st.sort = 'name-asc'; S.window._todasPessoasAplicarFiltro();
  h = vivo();
  ok(h.indexOf('Ana Souza') < h.indexOf('Bruno Lima'), 'A-Z ordena por nome dentro da seção');
  st.sort = 'order-desc'; st.search = 'carla'; S.window._todasPessoasAplicarFiltro();
  h = vivo();
  ok(h.indexOf('Carla Dias') !== -1 && h.indexOf('Ana Souza') === -1, 'a busca filtra por nome');
  st.search = '';

  // ── sem locais no MEU perfil: não há 1ª seção, e a tela DIZ por quê ────────
  const S2 = mkSandbox([]);
  const c2 = mkContainer(S2);
  S2.window.renderAllPeoplePage(c2);
  await new Promise(r => setTimeout(r, 60));
  const h2 = (S2._els['todas-pessoas-lista'] && S2._els['todas-pessoas-lista'].innerHTML) || c2.innerHTML;
  ok(!/Jogam nos seus locais/.test(h2), 'sem locais preferidos meus, não existe a 1ª seção');
  ok(/locais preferidos/.test(h2),
     'e a tela explica o porquê em vez de mostrar uma lista só, que a pessoa leria como "é isso mesmo"');

  // ── a tela de PESSOAS (#explore) ───────────────────────────────────────────
  const exp = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'explore.js'), 'utf8');
  ok(/sort: 'name-asc'/.test(exp),
     "⛔ #explore abre ALFABÉTICO (era 'order-desc' cronológico) — ordem do dono");
  ok(/_exploreLastSort = _fbSt\.sort \|\| 'name-asc'/.test(exp),
     'e o estado inicial acompanha o mesmo padrão (senão a 1ª ordenação discordaria da barra)');
  const iF = exp.indexOf("'<div id=\"explore-friends\"></div>'");
  const iP = exp.indexOf("'<div id=\"explore-pending\"></div>'");
  const iS = exp.indexOf("'<div id=\"explore-sent\"></div>'");
  ok(iF > 0 && iF < iP && iP < iS, 'amigos primeiro, convites não aceitos abaixo');
  ok(/hash = \\'#todas-pessoas\\'/.test(exp) || /#todas-pessoas/.test(exp),
     'a tela tem o botão Explorar apontando pra #todas-pessoas');
  ok(/scoreplace_totalPessoas/.test(exp),
     'e o número dele sai do total apurado pela outra tela (sem ele, fica sem número)');
  ok(/id="explore-results" style="display:none;"/.test(exp),
     'a seção de "outros usuários" saiu da tela de Pessoas');
  ok(!/_performUserSearch\(window\._exploreLastSearch/.test(exp),
     '⛔ e o scan de até 2000 docs da coleção users não roda mais ao abrir Pessoas');

  // ── card e ação são COMPARTILHADOS, não duplicados ─────────────────────────
  ok(/window\._explorePersonCard = /.test(exp) && /window\._explorePersonActionBtn = /.test(exp),
     'o card e o botão de ação são expostos pelo #explore');
  const nova = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'todas-pessoas.js'), 'utf8');
  ok(/window\._explorePersonCard\(/.test(nova) && !/btn btn-primary btn-sm hover-lift/.test(nova),
     '⛔ a tela nova USA esse card — não reescreve as 3 ramificações de "já convidei / me ' +
     'convidou / posso convidar", que é como duas telas passam a discordar do relacionamento');

  // ── ⛔ AGIR NA TELA EXPLORAR NÃO PODE TELEPORTAR PRA FORA DELA (2.1.15) ────
  // Bug do dono: _"convidei um novo amigo e voltou pra pagina dos amigos… deveria ficar na
  // pagina explorar até clicar em voltar"_. `_exploreScrollSafeRender` chamava
  // renderExplore SEMPRE — ela nasceu quando só havia UMA tela de pessoas, e todas as
  // ações (convidar/aceitar/rejeitar/cancelar) passam por ela. Com a tela nova usando as
  // mesmas ações, qualquer clique lá redesenhava Pessoas por cima.
  ok(/#todas-pessoas/.test(exp.slice(exp.indexOf('_exploreScrollSafeRender = function'),
                                     exp.indexOf('_exploreScrollSafeRender = function') + 1200)),
     '⛔ o redesenho pós-ação checa a ROTA antes de decidir o que redesenhar');
  ok(/_todasPessoasAplicarFiltro\(\)/.test(exp.slice(exp.indexOf('_exploreScrollSafeRender = function'),
                                                    exp.indexOf('_exploreScrollSafeRender = function') + 1200)),
     'e em #todas-pessoas ele só reaplica o filtro — sem refazer a busca e sem trocar de tela');

  // ── o botão do cabeçalho diz VOLTAR, não o nome da tela ───────────────────
  // O `label` do _renderBackHeader é o TEXTO DO BOTÃO. Passar o nome da página ali fazia o
  // botão dizer onde a pessoa ESTÁ em vez de para onde ele leva.
  [['todos-torneios.js', '#dashboard'], ['todas-pessoas.js', '#explore']].forEach(function (par) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', par[0]), 'utf8');
    const m = src.match(/_renderBackHeader\(\{[^}]*\}\)/);
    ok(!!m && !/label/.test(m[0]),
       par[0] + ': o back-header vai SEM label — o botão diz "Voltar" (o nome da tela é o <h2>)');
    ok(!!m && m[0].indexOf(par[1]) !== -1, par[0] + ': e volta pra ' + par[1]);
  });

  // ── o número do botão aparece na PRIMEIRA visita ──────────────────────────
  // _"cliquei no explorar e nao tinha o numero ali… e dai apareceu"_. Botão que ganha
  // número sozinho depois parece defeito. ⚠️ Custa o scan de `users` — mas SÓ quando não
  // há total guardado, e em segundo plano (a tela já pintou).
  ok(/if \(!_temTotal && window\.FirestoreDB/.test(exp),
     'sem total guardado, a tela de Pessoas apura o número em segundo plano');
  ok(/data-total-pessoas/.test(exp),
     'e pinta só o número, sem re-renderizar a tela por baixo de quem está lendo');

  // ── ⛔ AMIGO NÃO SE CONVIDA DE NOVO (2.1.16) ──────────────────────────────
  // Ordem do dono: _"no explorar pessoas, os já amigos devem aparecer ali verdes já como
  // amigos nao com o convidar (novamente)"_.
  // Na tela de Pessoas os amigos eram REMOVIDOS da lista de desconhecidos
  // (_dedupeAgainstRelationships), então esta ramificação nunca fez falta lá. #todas-pessoas
  // mostra TODO MUNDO — sem o ramo, ela oferecia convidar quem já é amigo.
  ok(/if \(isFriend\)/.test(exp), 'a ação de pessoa tem um ramo para "já é meu amigo"');
  ok(/window\._exploreMeusAmigos = /.test(exp),
     'e a lista de amigos tolera as duas formas gravadas (uid solto ou {uid}) — senão quem ' +
     'foi salvo como objeto nunca seria reconhecido');
  // ⚠️ ancorar na FUNÇÃO: existe outro `if (isFriend)` antes, no sheet de perfil
  // (onde ele oferece "Desfazer amizade"). Medir o trecho errado deixaria a asserção
  // verde ou vermelha por acidente.
  const iFn = exp.indexOf('window._explorePersonActionBtn = function');
  const iFriend = exp.indexOf('if (isFriend)', iFn);
  const trechoFriend = exp.slice(iFriend, iFriend + 700);
  ok(/Amigos/.test(trechoFriend) && /success-color/.test(trechoFriend),
     'o amigo aparece como SELO verde (a mesma cor da seção "Meus amigos")');
  ok(!/_sendFriendRequest/.test(trechoFriend),
     '⛔ e não há como convidar de novo quem já é amigo');
  ok(/var variant = \(myFriends\.indexOf/.test(exp),
     'o CARD do amigo também fica verde (variant friend) — verde tem que dizer a mesma coisa nas duas telas');

  // ── ⛔ O ✕ É O CANÔNICO, NOS DOIS LUGARES ────────────────────────────────
  // _"o botao cancelar convite poderia ter o x branco com o circulo vermelho padrao do
  // app. esse cancelar na tela dos amigos tambem"_. O components.css já mandava:
  // "NUNCA reintroduzir ✕ solto colorido — usar sempre esta classe ou window._cancelXBtn".
  const usosCancelX = (exp.match(/window\._cancelXBtn\(/g) || []).length;
  ok(usosCancelX >= 2,
     'os DOIS cancelares (tela de amigos e explorar) usam window._cancelXBtn — achei ' + usosCancelX);
  const codExp = exp.split('\n').filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  ok(codExp.indexOf('✉️ ✕') === -1,
     '⛔ o "✉️ ✕" improvisado não existe mais em lugar nenhum do explore.js');
  const css = fs.readFileSync(path.join(__dirname, '..', 'css', 'components.css'), 'utf8');
  ok(/\.cancel-x-btn\s*\{/.test(css) && /background:\s*#dc2626/.test(css),
     'e a classe canônica é mesmo o círculo vermelho com X branco (não inventei o padrão)');

  // ── ⛔ TODA LISTA DE PESSOA DIVIDE IGUAL (2.1.18) ─────────────────────────
  // Ordem do dono, depois de eu errar isto na 2.1.17: _"3 colunas de amigos, 3 colunas de
  // convites. qualquer que seja o numero de colunas de amigos nas diferentes larguras"_ —
  // e, olhando a tela Explorar: _"a mesma coisa aqui"_.
  //
  // ⚠️ O QUE EU ERREI: dei aos convites um minmax MAIOR (13rem) que o dos amigos (9.7rem),
  // achando que o card horizontal precisava de mais espaço. Mas `auto-fill` calcula as
  // colunas A PARTIR do minmax — valores diferentes NUNCA cairiam no mesmo número. O
  // pedido não era "convites mais largos", era "a mesma divisão".
  ok(/var _GRID_PESSOAS = /.test(exp),
     'existe UMA constante para o grid das listas de pessoa (enquanto o valor viver em dois lugares, ele diverge)');
  const usosGrid = (exp.match(/_GRID_PESSOAS/g) || []).length;
  ok(usosGrid >= 5,
     'as três listas do #explore usam a constante (amigos + recebidos + enviados) — achei ' + usosGrid + ' referências');
  ok(!/minmax\(13rem/.test(exp), '⛔ a largura mínima divergente (13rem) não voltou');
  ok(/window\._gridPessoas = _GRID_PESSOAS/.test(exp),
     'e ela é exposta para a QUARTA lista, a da tela #todas-pessoas');
  ok(/window\._gridPessoas/.test(nova) && !/flex-direction:column;gap:6px;margin-top:8px/.test(nova),
     '#todas-pessoas usa o mesmo grid (era uma coluna só)');

  // ⛔ E NENHUMA DAS SEÇÕES PODE TER RECUO PRÓPRIO — foi o que derrubou uma coluna.
  // MEDIDO no navegador a 700px, antes do conserto: amigos 3, recebidos 3, enviados 2.
  // A seção de enviados tinha uma caixa âmbar com padding:12px + borda = 26px a menos de
  // espaço para o grid interno, e no limiar isso vira uma coluna inteira.
  const iEnviados = exp.indexOf('Aguardando resposta');
  const cabecEnviados = exp.slice(Math.max(0, iEnviados - 700), iEnviados);
  ok(!/padding:12px;">' \+/.test(cabecEnviados),
     '⛔ a seção de convites enviados não tem caixa com padding própria (ela comia uma coluna)');

  // ── ⛔ A COR DIZ O ESTADO (2.1.18) ───────────────────────────────────────
  // _"convites pendentes em ambar"_. Sem este ramo, quem tinha convite em aberto ficava
  // com o card cinza dos desconhecidos e só o ✕ vermelho denunciava — a cor contava outra
  // história. Verde/âmbar/neutro são as MESMAS cores das seções da tela de Pessoas.
  ok(/\? 'friend'\s*\n?\s*:\s*\(\(_mySent\.indexOf\(uid\) !== -1 \|\| _myRecv\.indexOf\(uid\) !== -1\) \? 'pending' : 'other'\)/.test(exp),
     'o card é verde para amigo, ÂMBAR para convite pendente (enviado ou recebido) e neutro para desconhecido');

  // ── ⛔ O ✕ DE DESFAZER AMIZADE TAMBÉM É O CANÔNICO ───────────────────────
  // _"cade o cancelar paaro aqui porra?"_ — ele acabara de ver o círculo vermelho nos
  // convites e o dos amigos continuava um ✕ cinza com opacity 0.5, quase invisível.
  const iRemove = exp.indexOf("_removeFriend('");
  ok(iRemove > 0 && exp.slice(Math.max(0, iRemove - 220), iRemove).indexOf('_cancelXBtn') !== -1,
     'desfazer amizade usa o ✕ canônico (era um ✕ cinza com opacity 0.5)');
  ok(!/color:var\(--text-muted\);font-size:0\.88rem;[^"]*opacity:0\.5[^"]*">✕<\/button>/.test(exp),
     '⛔ e o ✕ pálido não voltou');

  console.log(pass + ' ok, ' + fail + ' falhas');
  process.exit(fail ? 1 : 0);
})();

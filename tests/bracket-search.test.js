/* BUSCA NAS CHAVES — filtro DOM dos cards de jogo. */
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0; function ok(c,m){if(c)pass++;else{fail++;console.error('  ✗',m);}}

// DOM mínimo: cards com data-players dentro de colunas, e um BOX DE GRUPO envolvendo uma
// coluna (v1.6.86 — é essa profundidade que o bug do print vivia: o pai imediato sumia e o
// box do grupo, com cabeçalho/botões/classificação, ficava de pé).
function mkEl(attrs, parent){
  const el={ style:{}, dataset:{}, parentElement:parent||null, children:[],
    getAttribute:(k)=>attrs[k],
    // qualquer seletor de card → TODOS os descendentes com data-players
    querySelectorAll:function(){
      const out=[]; (function walk(n){ n.children.forEach(c=>{ if(c.getAttribute('data-players')!==undefined) out.push(c); walk(c); }); })(this);
      return out;
    }};
  if(parent) parent.children.push(el);
  return el;
}
const groupBox=mkEl({'data-group-box':'1'});
const colA=mkEl({},groupBox), colB=mkEl({});
const cards=[
  mkEl({'data-players':'José Silva | Ana','data-match-num':'167'},colA),
  mkEl({'data-players':'Bruno / Carla | Bruno | Carla','data-match-num':'168'},colA),
  mkEl({'data-players':'Dinho 168 | Elza','data-match-num':'169'},colB),
];
const empty={style:{}};
const input={value:''};
const sandbox={window:null,document:{
  getElementById:(id)=>id==='bracket-search'?input:(id==='bracket-search-empty'?empty:null),
  querySelectorAll:()=>cards },console};
sandbox.window=sandbox; vm.createContext(sandbox);
// carrega só as 2 funções do fim do bracket.js
const src=fs.readFileSync(path.join(ROOT,'js','views','bracket.js'),'utf8');
const headerStart=src.indexOf('window._bracketHeaderFilterButtons = function');
const headerEnd=src.indexOf('window._bracketSyncHeaderFilterButtons = function',headerStart);
vm.runInContext(src.slice(headerStart,headerEnd),sandbox,{filename:'bracket-header-filters'});
sandbox.window.AppStore={currentUser:{uid:'user'}};
const header=sandbox.window._bracketHeaderFilterButtons;
ok(/Jogos pendentes<\/button>.*Só meus jogos<\/button>/.test(header(true,true)),'organizador vê os dois botões na ordem correta');
ok(!/Jogos pendentes/.test(header(false,true)) && /Só meus jogos/.test(header(false,true)),'participante não vê o filtro administrativo');
ok(header(true,false)==='','sem sorteio não mostra filtros de jogos');
const pendingStart=src.indexOf('window._bracketIsPendingMatch = function');
const pendingEnd=src.indexOf('window._togglePendingMatches = function',pendingStart);
vm.runInContext(src.slice(pendingStart,pendingEnd),sandbox,{filename:'bracket-pending-match'});
const pending=sandbox.window._bracketIsPendingMatch;
ok(pending({p1:'Ana',p2:'Bia'}),'dois confrontantes definidos, sem vencedor: pendente');
ok(pending({p1:'Ana',p2:'Bia',pendingResult:{score:'6-4'}}),'placar proposto ainda não definitivo: pendente');
ok(!pending({p1:'Ana',p2:'Bia',winner:'Ana'}),'resultado definitivo não é pendente');
ok(!pending({p1:'Ana',p2:'Bia',draw:true}),'empate definitivo não é pendente');
ok(!pending({p1:'Ana',p2:'TBD'}),'oponente da fase anterior indefinido não é pendente');
ok(!pending({p1:'Ana',p2:'Vencedor do jogo 186'}),'referência de origem não é confronto definido');
ok(!pending({p1:'Ana',p2:'Bia',isBye:true}),'BYE não é jogo pendente');
ok(pending({p1:'',p1Uid:'uid-a',p2:'Bia'}),'UID canônico basta para definir um lado sem nome hidratado');
ok(!pending({p1:'',team1Uids:[],p2:'Bia'}),'lista vazia de UIDs não define adversário');
const toggleStart=src.indexOf('window._togglePendingMatches = function');
const toggleEnd=src.indexOf('window._toggleMyMatches = function',toggleStart);
let focused=0, filtered=0;
const body={style:{},parentElement:null};
const pendingCard={style:{},parentElement:body,
  getBoundingClientRect:()=>({top:90,bottom:160}),scrollIntoView:()=>{focused++;}};
const toggleSandbox={window:null,document:{body,
  querySelectorAll:()=>[pendingCard],getElementById:()=>null},
  requestAnimationFrame:(fn)=>fn(),setTimeout:(fn)=>fn(),
  _applyMyMatchesFilter:()=>{filtered++;}};
toggleSandbox.window=toggleSandbox;
toggleSandbox.window._bracketSyncHeaderFilterButtons=()=>{};
vm.createContext(toggleSandbox);
vm.runInContext(src.slice(toggleStart,toggleEnd),toggleSandbox,{filename:'bracket-pending-toggle'});
toggleSandbox.window._togglePendingMatches(true);
ok(toggleSandbox.window._showOnlyPendingMatches===true && filtered===1 && focused===1,
  'ativar pendentes aplica o filtro e leva ao primeiro jogo visível');
const i=src.indexOf('window._bracketNorm = function');
vm.runInContext(src.slice(i),sandbox,{filename:'bracket-filter'});
const F=sandbox.window._bracketApplyFilter;

// O filtro não pode depender só deste DOM de mentira: o renderizador real do
// card precisa expor o número operacional que a busca consulta.
ok(/class="sp-match-card"[\s\S]{0,1200}data-match-num="\$\{matchNum != null \? matchNum : ''\}"/.test(src),
  'o card real escreve data-match-num com o número do jogo');

function vis(){return cards.map(c=>c.style.display!=='none');}

input.value=''; F();
ok(vis().every(Boolean),'sem busca: todos visíveis');
ok(empty.style.display==='none','sem busca: slot vazio escondido');

input.value='bru'; F();
ok(JSON.stringify(vis())==='[false,true,false]','trecho "bru" mostra só o card do Bruno — '+JSON.stringify(vis()));
ok(colB.style.display==='none','coluna sem card visível devia sumir');
ok(colA.style.display!=='none','coluna com card visível devia ficar');

input.value='jose'; F();
ok(vis()[0]===true,'acento-insensitive: "jose" devia achar "José"');

input.value='carla'; F();
ok(vis()[1]===true,'membro de dupla devia casar sozinho');

// A mesma busca numérica encontra tanto o número operacional do JOGO quanto uma pessoa
// cujo nome contenha os mesmos dígitos; ela não depende do texto visual "JOGO 168".
input.value='168'; F();
ok(JSON.stringify(vis())==='[false,true,true]', '"168" acha o JOGO 168 e pessoa com 168 no nome — '+JSON.stringify(vis()));

input.value='zzz'; F();
ok(vis().every(v=>!v),'busca sem resultado esconde tudo');
ok(empty.style.display==='block','busca sem resultado mostra "Nenhum jogo encontrado"');
// v1.6.86: o BOX DO GRUPO (avô dos cards) some junto. Era esse o bug do print — o pai
// imediato sumia e sobrava o box com cabeçalho, botões e CLASSIFICAÇÃO DO GRUPO.
ok(groupBox.style.display==='none','box de grupo sem NENHUM card casando devia sumir inteiro');

input.value='dinho'; F();
ok(groupBox.style.display==='none','o grupo cujo jogo não casa continua fora da tela');
ok(colB.style.display!=='none','a coluna do card que casou fica');

input.value=''; F();
ok(vis().every(Boolean),'limpar a busca RESTAURA todos os cards');
ok(colB.style.display!=='none','limpar a busca restaura as colunas');
ok(groupBox.style.display!=='none','limpar a busca restaura o box do grupo');

// "Só meus jogos" e a busca decidem JUNTOS o mesmo display (v1.6.86). Antes eram dois
// loops separados e o toggle desfazia a busca.
cards[0].getAttribute=(k)=>({'data-players':'José Silva | Ana','data-match-num':'167','data-my-match':'1'})[k];
cards[1].getAttribute=(k)=>({'data-players':'Bruno / Carla | Bruno | Carla','data-match-num':'168','data-my-match':'0'})[k];
cards[2].getAttribute=(k)=>({'data-players':'Dinho 168 | Elza','data-match-num':'169','data-my-match':'0'})[k];
sandbox.window._showOnlyMyMatches=true; input.value=''; F();
ok(JSON.stringify(vis())==='[true,false,false]','só meus jogos: fica só o card do usuário');
ok(colB.style.display==='none','só meus jogos: coluna sem jogo meu some');
input.value='dinho'; F();
ok(vis().every(v=>!v),'busca + toggle se somam (o jogo do Dinho não é meu)');
ok(empty.style.display==='block','nada sobrando com o toggle ligado mostra o slot vazio');
sandbox.window._showOnlyMyMatches=false; F();
ok(vis()[2]===true,'desligar o toggle NÃO desfaz a busca ativa ("dinho" segue valendo)');
ok(vis()[0]===false && vis()[1]===false,'…e os demais seguem filtrados pela busca');
input.value=''; F();
ok(vis().every(Boolean),'limpar tudo devolve todos os cards');

// A barra completa filtra metadados dos jogos, mas não reordena nem troca a aba.
cards[0].getAttribute=(k)=>({'data-players':'José Silva | Ana','data-match-num':'167','data-bracket-tab-gender':'fem','data-bracket-tab-category':'Fem Light'})[k];
cards[1].getAttribute=(k)=>({'data-players':'Bruno / Carla | Bruno | Carla','data-match-num':'168','data-bracket-tab-gender':'masc','data-bracket-tab-category':'Masc Power'})[k];
cards[2].getAttribute=(k)=>({'data-players':'Dinho 168 | Elza','data-match-num':'169','data-bracket-tab-gender':'fem','data-bracket-tab-category':'Fem Extreme'})[k];
sandbox.window._filterBarState={chaves:{gender:'Fem',skill:'Light'}};
F();
ok(JSON.stringify(vis())==='[true,false,false]','Fem + Light encontra somente o jogo Fem Light');
ok(empty.style.display==='none','um jogo compatível não mostra vazio');
cards[0].hidden=true; F();
ok(empty.style.display==='block' && /outra aba/.test(empty.textContent),'jogo compatível em aba oculta indica outra aba');
cards[0].hidden=false;
sandbox.window._filterBarState.chaves.skill='Power'; F();
ok(vis().every(v=>!v) && empty.style.display==='block','filtros incompatíveis não mostram falso positivo');
sandbox.window._filterBarState.chaves.gender='all'; F();
ok(vis()[1]===true && vis()[0]===false,'categoria Power sem gênero restringe somente o jogo Power');
sandbox.window._filterBarState.chaves.skill='all'; F();
ok(vis().every(Boolean),'limpar gênero/categoria restaura os jogos');

// O novo filtro compõe com busca e "Só meus jogos"; não aceita cards sem jogo.
cards[0].getAttribute=(k)=>({'data-players':'José Silva | Ana','data-match-num':'167','data-my-match':'1','data-bracket-pending-match':'1'})[k];
cards[1].getAttribute=(k)=>({'data-players':'Bruno / Carla | Bruno | Carla','data-match-num':'168','data-my-match':'0','data-bracket-pending-match':'0'})[k];
cards[2].getAttribute=(k)=>({'data-players':'Dinho 168 | Elza','data-match-num':'169','data-my-match':'0','data-bracket-pending-match':'1'})[k];
sandbox.window._showOnlyPendingMatches=true; F();
ok(JSON.stringify(vis())==='[true,false,true]','pendentes escondem apenas jogo definitivo/indefinido');
sandbox.window._showOnlyMyMatches=true; F();
ok(JSON.stringify(vis())==='[true,false,false]','pendentes + meus jogos: interseção');
input.value='dinho'; F();
ok(vis().every(v=>!v),'busca + pendentes + meus jogos preservam interseção');
input.value=''; sandbox.window._showOnlyMyMatches=false; sandbox.window._showOnlyPendingMatches=false; F();

// Jogador X é uma VAGA — encontrá-lo pede o contexto completo do grupo (os três
// jogos e a classificação), enquanto a busca por pessoa real acima continua cirúrgica.
const ghostCard=mkEl({'data-players':'Jogador X | Ana'},colA);
cards.push(ghostCard);
input.value='jogador'; F();
ok(vis()[0]===true && vis()[1]===true && vis()[3]===true,
  'buscar Jogador X mostra TODOS os jogos do grupo da vaga');
ok(vis()[2]===false,'buscar Jogador X não mostra grupo sem Jogador X');
input.value=''; F();
ok(vis().every(Boolean),'limpar a busca do Jogador X restaura os jogos');


// ── A barra tem que existir TAMBÉM no bracket INLINE — e FORA do container dele ──
// Bug 1 (v1.4.14→18): gateei a injeção com `!isInline`, copiando o gate que existe pros
// BOTÕES DE AÇÃO (esses sim seriam duplicados na página do torneio). Resultado: a barra não
// aparecia em #tournaments/<id> — exatamente a tela onde o dono foi procurar alguém.
// Bug 2 (v1.7.10): a barra existia no inline, mas nascia DENTRO do #inline-bracket-container.
// `position:sticky` só gruda enquanto O PAI está na viewport, então ela DESCOLAVA do cabeçalho
// antes do fim da página (medido a 390px: topo em -187px, ~358px antes do fim).
// ASSERÇÃO REVISADA (o invariante NÃO mudou — "a busca existe na tela inline" continua
// travado): o que mudou foi QUEM emite. Agora quem emite no inline é o renderTournaments,
// logo acima do #inline-bracket-container — mesma posição visual, pai que dura a página toda.
// Por isso o gate `isInline` em bracket.js voltou a ser CORRETO ali: sem ele, DUAS barras.
(function () {
  const fs2 = require('fs'), path2 = require('path');
  const brSrc = fs2.readFileSync(path2.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
  const tSrc  = fs2.readFileSync(path2.join(__dirname, '..', 'js', 'views', 'tournaments.js'), 'utf8');

  const m = brSrc.match(/if \(([^)]*)typeof window\._bracketBar === 'function'\) \{/);
  ok(!!m, 'injeção do _bracketBar não encontrada em bracket.js');
  const brGateiaInline = !!(m && m[1].indexOf('isInline') !== -1);

  // O invariante REAL: a tela inline (#tournaments/<id>) emite a barra em ALGUM lugar.
  const tEmite = /window\._bracketBar\s*===\s*'function'\s*\?\s*window\._bracketBar\(visible\[0\],\s*true\)/.test(tSrc)
              || /window\._bracketBar\(visible\[0\],\s*true\)/.test(tSrc);
  ok(brGateiaInline ? tEmite : true,
    'REGRESSÃO: bracket.js gateia por isInline e o renderTournaments NÃO emite a barra — a busca some do chaveamento inline');
  ok(!brGateiaInline ? !tEmite : true,
    'REGRESSÃO: barra DUPLICADA no inline (bracket.js não gateia e tournaments.js também emite)');
  ok(tEmite || !brGateiaInline, 'a busca precisa existir na tela inline por um dos dois caminhos');

  // ⚠️ ASSERÇÃO REVISADA em 05/ago/2026 (v1.7.43). Ela exigia que a barra ficasse
  // IMEDIATAMENTE acima do #inline-bracket-container — a posição que a 1.7.14 escolheu.
  // MEDIDO no navegador do dono: ali a barra cai em y=2826, porque há 2.320px de detalhe do
  // torneio ANTES dela — e `sticky` NÃO puxa nada pra cima, só prende depois que a rolagem
  // leva a posição natural acima do `top`. Era preciso rolar ~2.700px pra ela grudar, e o
  // "trava quando entra e depois quebra" era o conteúdo acima terminando de montar.
  // Ordem do dono: "travado no topo sempre visível e ativo" → 1ª irmã depois do CABEÇALHO.
  //
  // O que a asserção protegia de verdade — a barra NÃO pode nascer dentro do container do
  // chaveamento, senão o `sticky` morre junto com o pai (o defeito que a 1.7.14 consertou) —
  // continua travado abaixo, e agora com o pai correto sendo o #view-container.
  if (tEmite) {
    const bloco = tSrc.slice(tSrc.indexOf('window._bracketBar(visible[0], true)'),
                             tSrc.indexOf('window._bracketBar(visible[0], true)') + 260);
    ok(/\$\{filterBarHtml\}/.test(bloco) || /id="inline-bracket-container"/.test(bloco),
      'a barra do inline fica no TOPO do fluxo (logo após o cabeçalho), não no meio da página');
    const antesDaBarra = tSrc.slice(0, tSrc.indexOf('window._bracketBar(visible[0], true)'));
    ok(!/id="inline-bracket-container"[\s\S]*$/.test(antesDaBarra.slice(-400)),
      'a barra NUNCA nasce DENTRO/depois do #inline-bracket-container (sticky morre com o pai)');
  }
})();

console.log((fail===0?'✅':'❌')+` bracket-search: ${pass} ok, ${fail} falharam`);
process.exit(fail===0?0:1);

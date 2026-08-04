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
  mkEl({'data-players':'José Silva | Ana'},colA),
  mkEl({'data-players':'Bruno / Carla | Bruno | Carla'},colA),
  mkEl({'data-players':'Dinho | Elza'},colB),
];
const empty={style:{}};
const input={value:''};
const sandbox={window:null,document:{
  getElementById:(id)=>id==='bracket-search'?input:(id==='bracket-search-empty'?empty:null),
  querySelectorAll:()=>cards },console};
sandbox.window=sandbox; vm.createContext(sandbox);
// carrega só as 2 funções do fim do bracket.js
const src=fs.readFileSync(path.join(ROOT,'js','views','bracket.js'),'utf8');
const i=src.indexOf('window._bracketNorm = function');
vm.runInContext(src.slice(i),sandbox,{filename:'bracket-filter'});
const F=sandbox.window._bracketApplyFilter;

function vis(){return cards.map(c=>c.style.display!=='none');}

input.value=''; F();
ok(vis().every(Boolean),'sem busca: todos visíveis');
ok(empty.style.display==='none','sem busca: slot vazio escondido');

input.value='bru'; F();
ok(JSON.stringify(vis())==='[false,true,false]','trecho "bru" devia mostrar só o card do Bruno — '+JSON.stringify(vis()));
ok(colB.style.display==='none','coluna sem card visível devia sumir');
ok(colA.style.display!=='none','coluna com card visível devia ficar');

input.value='jose'; F();
ok(vis()[0]===true,'acento-insensitive: "jose" devia achar "José"');

input.value='carla'; F();
ok(vis()[1]===true,'membro de dupla devia casar sozinho');

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
cards[0].getAttribute=(k)=>({'data-players':'José Silva | Ana','data-my-match':'1'})[k];
cards[1].getAttribute=(k)=>({'data-players':'Bruno / Carla | Bruno | Carla','data-my-match':'0'})[k];
cards[2].getAttribute=(k)=>({'data-players':'Dinho | Elza','data-my-match':'0'})[k];
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


// ── A barra tem que ser injetada TAMBÉM no bracket INLINE ────────────────────
// Bug real (v1.4.14→18): eu gateei a injeção com `!isInline`, copiando o gate que existe
// pros BOTÕES DE AÇÃO (esses sim seriam duplicados na página do torneio). Resultado: a barra
// não aparecia em #tournaments/<id> — exatamente a tela onde o dono foi procurar alguém.
// Checagem no FONTE porque o bug é do call site (o _bracketBar em si sempre funcionou).
(function () {
  const fs2 = require('fs'), path2 = require('path');
  const src2 = fs2.readFileSync(path2.join(__dirname, '..', 'js', 'views', 'bracket.js'), 'utf8');
  const m = src2.match(/if \(([^)]*)typeof window\._bracketBar === 'function'\) \{/);
  ok(!!m, 'injeção do _bracketBar não encontrada em bracket.js');
  ok(m && m[1].indexOf('isInline') === -1,
    'REGRESSÃO: a barra de busca voltou a ser gateada por isInline — some do chaveamento inline (#tournaments/<id>)');
})();

console.log((fail===0?'✅':'❌')+` bracket-search: ${pass} ok, ${fail} falharam`);
process.exit(fail===0?0:1);

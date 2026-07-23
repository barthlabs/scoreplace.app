/* BUSCA NAS CHAVES — filtro DOM dos cards de jogo. */
const fs=require('fs'),path=require('path'),vm=require('vm');
const ROOT=path.join(__dirname,'..');
let pass=0,fail=0; function ok(c,m){if(c)pass++;else{fail++;console.error('  ✗',m);}}

// DOM mínimo: cards com data-players dentro de 2 colunas.
function mkEl(attrs, parent){
  const el={ style:{}, dataset:{}, parentElement:parent||null, children:[],
    getAttribute:(k)=>attrs[k], querySelectorAll:function(sel){
      // ':scope > [data-players]' → filhos diretos com data-players
      return this.children.filter(c=>c.getAttribute('data-players')!==undefined);
    }};
  if(parent) parent.children.push(el);
  return el;
}
const colA=mkEl({}), colB=mkEl({});
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

input.value=''; F();
ok(vis().every(Boolean),'limpar a busca RESTAURA todos os cards');
ok(colB.style.display!=='none','limpar a busca restaura as colunas');


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

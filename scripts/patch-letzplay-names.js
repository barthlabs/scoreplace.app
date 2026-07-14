/** patch-letzplay-names.js — aplica nomes de apresentação reais (extraídos ao vivo do
 * letzplay) aos jogos gravados em users/{uid}.letzplayImport.games no STAGING, casando
 * por handle. Mantém handles/placares intactos. Uso:
 *   node scripts/patch-letzplay-names.js --uid <UID>
 */
'use strict';
const path = require('path');
const admin = require(path.join(__dirname, '..', 'functions', 'node_modules', 'firebase-admin'));
function arg(n, d){ const i=process.argv.indexOf(n); if(i===-1)return d; const v=process.argv[i+1]; return (v&&!v.startsWith('--'))?v:true; }
const UID = arg('--uid', null);
if(!UID){ console.error('faltou --uid'); process.exit(1); }
admin.initializeApp({ projectId: 'scoreplace-staging' });
const db = admin.firestore();

const NAME_BY_HANDLE = {"MarceloBemelmans1":"Marcelo Bemelmans","GersomOtsu":"Gersom Otsu","JoaoScassa":"João Scassa","FabioRuggiero2":"Fabio Ruggiero","FabioSimaoB":"Fabio Simao B","msmano":"Max","PauloOriente":"Paulo Oriente","RenatoOshima":"Renato Oshima","ArnaldoMenezes1":"Arnaldo Menezes","MarcoAntonioStricagnolo":"Marco Antonio Stricagnolo","FernandoDoria1":"Fernando Doria","MarcoVasco":"Marco Vasco","RonaldoSilva18":"Ronaldo Silva","LuizFelipeNeves":"Luiz Felipe Neves","DaniloSCampos":"Danilo SCampos","CarlosMoraes20":"Carlos Moraes","ValtencioVieira1":"Valtencio Vieira","AdrianoColetta":"Adriano Coletta","ClaudioGuimaraes1":"Claudio Guimaraes","AlexandreKitahara2":"Alexandre Kitahara","HenriqueTanaka2":"Henrique Tanaka","RicardoPettena":"Ricardo Pettená","DouglasLeonardo":"Douglas Leonardo","GabrielCampolongo":"Gabriel Campolongo","JoaoBree":"João Bree","AriRabello":"Ari Rabello","CORINGAH":"Coringa H","CoringaM1":"Coringa M","KellyBarth1":"Kelly Barth","FernandoIde":"Fernando Ide","LiviaMorais":"Lívia Morais","FabioGod":"Fabio God","MoniqueTraldi":"Monique Traldi","PauloSierra":"Paulo Sierra","RenataSierra":"Renata Sierra","MarcusVinicius":"Marcus Vinicius","ArturDieguez":"Artur Dieguez","PierreSouza1":"Pierre Souza","JoaoFlavioAlves":"Joao Flavio Alves","FlavioStaudohar":"Flavio Staudohar","GuilhermeLutz":"Guilherme Lutz","RobertoAlmeida9":"Roberto Almeida","Basile":"Luis Basile","Krieger":"Stefan Krieger","jngepp":"John","LeandroAzevedo9":"Leandro Azevedo","FabioMenezes":"Fabio Menezes","FranciscoMonteleone":"Francisco Monteleone","RodrigoJolig1":"Rodrigo Jolig","Maldonadoleo":"Leonardo Maldonado","KevinBree":"Kevin Bree","MarcosLeal":"Marcos Leal"};

(async function(){
  const ref = db.collection('users').doc(UID);
  const doc = await ref.get();
  const imp = (doc.data()||{}).letzplayImport;
  if(!imp || !Array.isArray(imp.games)){ console.error('sem letzplayImport.games'); process.exit(1); }
  let patched = 0;
  imp.games.forEach(function(g){
    if(g.partnerHandle && NAME_BY_HANDLE[g.partnerHandle]){ g.partnerName = NAME_BY_HANDLE[g.partnerHandle]; patched++; }
    if(Array.isArray(g.oppHandles)){
      g.oppNames = g.oppHandles.map(function(h,i){ return NAME_BY_HANDLE[h] || (g.oppNames && g.oppNames[i]) || ''; });
    }
  });
  await ref.set({ letzplayImport: imp }, { merge: true });
  console.log('games:', imp.games.length, '| partnerNames patched:', patched);
  console.log('sample:', JSON.stringify(imp.games.slice(0,3).map(g=>({p:g.partnerName,o:g.oppNames}))));
})().then(()=>process.exit(0)).catch(e=>{ console.error(e); process.exit(1); });

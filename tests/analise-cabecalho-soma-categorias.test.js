'use strict';
// O cabeçalho da Análise conta pessoas posicionadas nas categorias do torneio,
// não somente os perfis que declararam gênero. Não toca no roster de produção.
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments-enrollment-report.js'), 'utf8');
const start = source.indexOf('function _erPairPlacementGender(members, t) {');
const end = source.indexOf('\n  window._erPairPlacementGender =', start);
assert.ok(start > 0 && end > start, 'resolvedor real encontrado');
const staged = new Map();
const context = {
  _erPairCategory: members => staged.has(members[0].id) ? staged.get(members[0].id) : members[0].category,
  _decomposeCat: category => ({ gender: /^Fem(?:\s|$)/.test(category || '') ? 'Fem' : /^Masc(?:\s|$)/.test(category || '') ? 'Masc' : 'Misto' }),
  _mxGenderOf: member => member.profileGender || null,
};
const placedGender = vm.runInNewContext('(' + source.slice(start, end) + ')', context);
const pair = (id, category, profileGender) => [{ id, category, profileGender }, { id: id + '-b' }];
const pairs = [];
for (let i = 0; i < 64; i++) {
  const category = i < 16 ? 'Fem Light' : i < 24 ? 'Fem Power' : i < 32 ? 'Fem Extreme'
    : i < 48 ? 'Masc Light' : i < 56 ? 'Masc Power' : 'Masc Extreme';
  // Perfis ausentes e divergentes reproduzem os importados do Neon.
  pairs.push(pair(i, category, i % 3 === 0 ? null : (i % 2 ? 'feminino' : 'masculino')));
}
const counts = () => pairs.reduce((n, members) => {
  const gender = placedGender(members, {});
  if (gender) n[gender] += 2;
  return n;
}, { feminino: 0, masculino: 0 });
assert.deepEqual(counts(), { feminino: 64, masculino: 64 }, '32+16+16 pessoas em cada gênero');
for (let i = 32; i < 40; i++) staged.set(i, 'Fem Light');
assert.deepEqual(counts(), { feminino: 80, masculino: 48 }, 'mover 8 duplas na prévia desloca 16 pessoas');
assert.equal(placedGender(pair('mixed', 'Misto', 'feminino'), {}), 'feminino', 'Misto usa gênero pessoal');
assert.equal(placedGender(pair('none', '', 'masculino'), {}), 'masculino', 'sem categoria usa gênero pessoal');
assert.equal(placedGender(pair('unknown', '', null), {}), null, 'sem categoria nem gênero permanece indefinido');

const matrix = source.slice(source.indexOf('function _matrixInner(rows, t) {'), source.indexOf('window._erRenderMatrix', source.indexOf('function _matrixInner(rows, t) {')));
assert.match(matrix, /var genderMatches = _erPairPlacementGender\(members, t\) === genderKey/, 'box usa o mesmo gênero de posição');
assert.match(matrix, /pairFemTotal = pairGroups\.reduce[^\n]+_erPairPlacementGender\(members, t\)/, 'cabeçalho feminino usa o mesmo resolvedor');
assert.match(matrix, /pairMascTotal = pairGroups\.reduce[^\n]+_erPairPlacementGender\(members, t\)/, 'cabeçalho masculino usa o mesmo resolvedor');
console.log('✅ Cabeçalhos da Análise somam as categorias: 8 verificações');

// Individual rotating groups: category placement is independent of personal gender.
{
  const W = {_souOrganizador:()=>true,_spCor:value=>value,
    _getTournamentCategories:t=>(t.categoryDefinitions||[]).map(c=>c.label),
    _initialMonarchIndividualEnrollment:()=>false};
  const instrumented=source.replace(/\n\}\)\(\);\s*$/, '\nwindow.__placementTest={build:_buildRows,matrix:_matrixInner,gender:_erIndividualPlacementGender,skill:_mxSkillOf,layout:_erIndividualCategoryLayout,edit:(order,edit)=>{_pendingEdits[order]=edit;}};\n})();');
  vm.runInNewContext(instrumented,{window:W,document:{getElementById:()=>null},console,setTimeout,clearTimeout});
  const labels=['Fem A','Fem B','Fem C','Masc A','Masc B','Masc C','Masc PROFESSORES'];
  const definitions=labels.map((label,i)=>({id:'category-'+i,label,enabled:true}));
  const t={id:'individual-analysis',sport:'Beach Tennis',enrollmentMode:'individual',fmt2:{parceria:'rotation_groups'},
    canonicalRegistrationMigration:{fingerprint:'synthetic',registrationCount:80},categoryDefinitions:definitions,
    customCategories:['A','B','C','PROFESSORES'],combinedCategories:labels,excludedCategories:['Fem PROFESSORES'],maxParticipantsByCategory:Object.fromEntries(labels.map((l,i)=>[l,i<3?16:8]))};
  const parts=definitions.flatMap((d,i)=>Array.from({length:i<3?16:8},(_,j)=>({manualParticipantId:'slot-'+i+'-'+j,
    categoryId:d.id,categories:[d.label],displayName:'Pessoa '+i+' '+j,gender:i%2?'feminino':null})));
  const before=JSON.stringify(parts),api=W.__placementTest,rows=api.build(t,parts,{byUid:{}});
  assert.equal(rows.length,80);assert.equal(api.layout(t),true);
  assert.equal(rows.filter(r=>api.gender(r,t)==='feminino').length,48);
  assert.equal(rows.filter(r=>api.gender(r,t)==='masculino').length,32);
  const html=api.matrix(rows,t);
  for(const [i,label] of labels.entries())assert(new RegExp(label+' <span[^>]*>\\('+ (i<3?16:8) +'\\)</span>').test(html),'summary category count '+label);
  assert(!html.includes('? Sem gênero'));assert(!html.includes('placeholder-pair:'));
  for(const r of rows)assert.equal((html.match(new RegExp('data-er-person="'+r.name+'"','g'))||[]).length,1,'each individual appears once');
  assert(!/data-er-gender="feminino" data-er-skill="PROFESSORES"/.test(html));
  api.edit(rows[0].order,{category:'Masc B'});assert.equal(api.gender(rows[0],t),'masculino');assert.equal(api.skill(rows[0],t),'B');
  api.edit(rows[0].order,{category:''});assert.equal(api.gender(rows[0],t),null,'explicitly cleared category falls back to personal gender');
  assert.equal(api.layout({...t,currentPhaseIndex:1}),false,'later phase keeps pair workflow');
  assert.equal(JSON.stringify(parts),before,'analysis never writes profile gender or registrations');
  console.log('✓ análise individual:80pessoas/48Fem/32Masc,7categorias,professoresapenasMasc,semduplicação,staging e perfil preservados');
}

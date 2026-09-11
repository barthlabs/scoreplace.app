'use strict';
const acorn = require('acorn');
const NAMES = new Set(['saveTournament','mutateTournament','mutateMatchResult','commitTournamentTx',
  'commitMatchResult','commitDrawTx','sync','syncImmediate','mutate','seedMatchResultDocs','reseedMatchRoster']);
function scan(source) {
  const ast=acorn.parse(source,{ecmaVersion:'latest',sourceType:'script',locations:true});
  const rows=[], aliases=new Map();
  function member(n){return n && n.type==='MemberExpression' ? (n.computed ? n.property.value : n.property.name) : null;}
  function visit(n,owner){
    if(!n||typeof n!=='object')return;
    if(n.type==='Property'&&n.value&&/Function/.test(n.value.type))owner=n.key.name||n.key.value;
    if(n.type==='FunctionDeclaration'&&n.id)owner=n.id.name;
    if(n.type==='AssignmentExpression'&&n.right&&/Function/.test(n.right.type))owner=source.slice(n.left.start,n.left.end);
    if(n.type==='VariableDeclarator'&&n.init){
      if(n.id.type==='Identifier'&&NAMES.has(member(n.init)))aliases.set(n.id.name,member(n.init));
      if(n.id.type==='ObjectPattern')n.id.properties.forEach(p=>{if(p.key&&NAMES.has(p.key.name)&&p.value)aliases.set(p.value.name,p.key.name);});
    }
    if(n.type==='CallExpression'){
      let name=member(n.callee);
      if(['call','apply','bind'].includes(name))name=member(n.callee.object)||aliases.get(n.callee.object.name);
      if(n.callee.type==='Identifier')name=aliases.get(n.callee.name);
      if(NAMES.has(name))rows.push({line:n.loc.start.line,owner:owner||'(top level)',name});
    }
    Object.keys(n).forEach(k=>{if(k==='loc')return;const v=n[k];if(Array.isArray(v))v.forEach(x=>visit(x,owner));else if(v&&typeof v==='object')visit(v,owner);});
  }
  visit(ast,'');return rows;
}
module.exports={scan};

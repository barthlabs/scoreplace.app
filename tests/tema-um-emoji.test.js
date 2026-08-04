/* Tema: UM emoji só. O botão prefixava 🌙/☀️ e a string de i18n já trazia o emoji
 * dentro — a tela mostrava "🌙🌙 Noturno" / "☀️☀️ Claro" (print do dono, 03/ago/2026).
 * Trava os DOIS lados: a i18n é a dona do emoji, o botão não repete. */
const fs=require('fs'),path=require('path');
let ok=0,fail=0;const t=(l,c,e)=>{c?(ok++,console.log('  ✓ '+l)):(fail++,console.log('  ✗ '+l+(e?'  → '+e:'')));};
const auth=fs.readFileSync(path.join(__dirname,'..','js','views','auth.js'),'utf8');
const pt=fs.readFileSync(path.join(__dirname,'..','js','i18n-pt.js'),'utf8');
const en=fs.readFileSync(path.join(__dirname,'..','js','i18n-en.js'),'utf8');
const btn=k=>{const m=auth.match(new RegExp("data-theme-val=\\\"(?:dark|light)\\\"[\\s\\S]{0,600}?_t\\('profile\\."+k+"'\\)"));return m?m[0]:'';};
['themeNight','themeLight'].forEach(k=>{
  const b=btn(k);
  t('botão '+k+' existe', !!b);
  const emojis=(b.match(/🌙|☀️/g)||[]).length;
  t('botão '+k+' NÃO repete emoji no HTML', emojis===0, 'achei '+emojis);
});
[['pt',pt],['en',en]].forEach(([lng,src])=>{
  ['themeNight','themeLight'].forEach(k=>{
    const m=src.match(new RegExp("'profile\\."+k+"':\\s*'([^']*)'"));
    t(lng+'/'+k+' tem exatamente 1 emoji', !!m && (m[1].match(/🌙|☀️/g)||[]).length===1, m?m[1]:'ausente');
  });
});
console.log('\n'+ok+' asserts OK, '+fail+' falha(s)');
process.exit(fail?1:0);

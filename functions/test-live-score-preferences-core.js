'use strict'; const C=require('./live-score-preferences-core'); let f=0,p=0; const ok=(n,c)=>{if(c)p++;else{f++;console.error('  ✗ '+n)}}; const bad=(n,v)=>{try{C.normalize(v);ok(n,false)}catch(_){ok(n,true)}};
ok('aceita escalas e lados', C.normalize({nameScale:1,photoScale:4,fixSides:true}).photoScale===4);
bad('rejeita campo estranho',{displayName:'Ana'}); bad('rejeita escala fora',{scoreScale:4.01}); bad('rejeita escala texto',{btnScale:'1'}); bad('rejeita booleano inválido',{fixSides:'true'}); bad('rejeita vazio',{});
console.log((f?'❌':'✅')+' live-score-preferences-core: '+p+' ok, '+f+' falharam'); process.exit(f?1:0);

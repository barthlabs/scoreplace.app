// O AVISO DE CONTA DUPLICADA DIZ QUAL CANAL PROVA A POSSE — não "e-mail ou celular" no genérico.
//
// CASO REAL (Fabiana Ferré, 22/ago/2026, medido no dado):
//   15:35:31  entrou com Google → nasceu uma 2ª conta (fabiana@fabianaferre.com.br)
//   15:35:36  o servidor gravou dupSuspect { motivo:"nome", maskedEmail:"fa***@gmail.com",
//             maskedPhone: NULL }  ← a outra conta dela NÃO TEM celular
//   15:37-15:39  ela pediu SMS 3× (fluxo "principal") — o Google entregou (HTTP 200) e nada
//             chegou; e mesmo que chegasse, o celular DELA não prova posse da OUTRA conta
//   15:50     ela voltou pra conta antiga, achando que o app estava quebrado
//
// A fusão nunca aconteceu (sem `mergedInto`, sem `loginRedirects`) — o app não errou a
// SEGURANÇA. Errou o TEXTO: ofereceu um canal que aquela conta não tinha.
//
// REGRA TRAVADA: só se oferece canal que a conta-alvo REALMENTE tem.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

console.log('\n──── o aviso de duplicata nomeia o canal que existe ────');

const src = fs.readFileSync(path.join(__dirname, '..', 'js/views/tournaments-enrollment.js'), 'utf8');
const corpo = src.slice(src.indexOf('window._askDuplicatePerson = function'),
                        src.indexOf('\n};', src.indexOf('window._askDuplicatePerson = function')) + 3);

function abrir(dup) {
  var visto = { titulo: '', corpo: '', aviso: '' };
  const w = {
    _safeHtml: s => String(s == null ? '' : s),
    showConfirmDialog: function (t, c) { visto.titulo = t; visto.corpo = c; },
    showNotification: function (t, m) { visto.aviso = m; }
  };
  w.window = w;
  vm.createContext(w);
  vm.runInContext('var showConfirmDialog = this.showConfirmDialog, showNotification = this.showNotification;\n' + corpo, w);
  w._askDuplicatePerson('t1', dup);
  // dispara o ramo do "Sim" pra ver o aviso
  const cb = [];
  w.showConfirmDialog = function (t, c, sim) { cb.push(sim); };
  w.location = { hash: '' };
  vm.runInContext('this.showConfirmDialog = ' + 'function(t,c,s){ this.__sim = s; };', w);
  return visto;
}

// ── o caso da Fabiana: SÓ e-mail ────────────────────────────────────────────
const soEmail = abrir({ maskedEmail: 'fa***@gmail.com', maskedPhone: null, motivo: 'nome' });
ok(/fa\*\*\*@gmail\.com/.test(soEmail.corpo), 'nomeia o e-mail da outra conta');
ok(!/celular/i.test(soEmail.corpo),
   '⛔ e NÃO oferece celular — a outra conta não tem (foi o que mandou a Fabiana pro SMS)');
ok(/link no e-mail/.test(soEmail.corpo), 'e diz COMO: link no e-mail');

// ── só celular ──────────────────────────────────────────────────────────────
const soFone = abrir({ maskedEmail: null, maskedPhone: '****-0222', motivo: 'nome' });
ok(/\*\*\*\*-0222/.test(soFone.corpo), 'com só celular, nomeia o celular');
ok(!/e-mail/i.test(soFone.corpo), '⛔ e não oferece e-mail que não existe');

// ── os dois ─────────────────────────────────────────────────────────────────
const ambos = abrir({ maskedEmail: 'fa***@gmail.com', maskedPhone: '****-0222', motivo: 'nome' });
ok(/e-mail/.test(ambos.corpo) && /celular/.test(ambos.corpo), 'tendo os dois, oferece os dois');
ok(/ ou pelo /.test(ambos.corpo), 'ligados por "ou pelo"');

// ── nenhum: não promete canal nenhum ────────────────────────────────────────
const nenhum = abrir({ maskedEmail: null, maskedPhone: null, motivo: 'nome' });
ok(/confirmar a posse daquela conta/.test(nenhum.corpo) && !/link no e-mail/.test(nenhum.corpo),
   'sem contato conhecido, não inventa canal');

// ── a SEGURANÇA continua: nome igual NUNCA une sozinho ──────────────────────
ok(/Nada é unido só porque os nomes são iguais/.test(soEmail.corpo),
   'o texto segue dizendo que nome igual não une nada');
// ⭐ 2.1 — UMA ÚNICA POSSIBILIDADE no "Sim". Ordem do dono: "tem que abrir uma única
// possibilidade quando ela diz que é ela e não o perfil porra. assim ela não sabe o que fazer."
ok(/httpsCallable\('requestNameMergeProof'\)/.test(corpo),
   'o "Sim" DISPARA a prova (manda o link), em vez de largar a pessoa no perfil');
ok(/Link enviado|📬 Link enviado/.test(corpo), 'e diz que o link foi enviado');
ok(/d\.masked/.test(corpo), 'nomeando a caixa pra onde foi');
ok(/#profile/.test(corpo), 'o perfil continua como saída SÓ quando não há e-mail na outra conta');
ok(/digite o CELULAR DAQUELA conta/.test(corpo),
   'e nesse caso diz O QUE fazer lá — o celular DA OUTRA conta, não o desta');
ok(/resource-exhausted/.test(corpo), 'e trata o limite de envios sem mensagem crua de erro');
ok(!/mergedInto|_mergeAccounts|fundir/.test(corpo),
   '⛔ o diálogo não funde nada por conta própria');
// ⛔ o desvio pro perfil como PRIMEIRA saída morreu — era o buraco em que a Fabiana caiu
ok(!/Abrimos seu perfil: confirme pelo e-mail ou pelo celular/.test(corpo),
   '⛔ sumiu o toast genérico "confirme pelo e-mail ou pelo celular"');

console.log('  ' + pass + ' asserts OK, ' + fail + ' falhas');
if (fails.length) fails.forEach(f => console.error('  ✗ ' + f));
console.log(fail === 0 ? '✅ duplicata-nomeia-o-canal: OK' : '❌ duplicata-nomeia-o-canal FALHOU');
process.exit(fail > 0 ? 1 : 0);

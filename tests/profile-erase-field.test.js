/* APAGAR CAMPO DO PERFIL — o que a pessoa apaga PRECISA sumir.
 * node tests/profile-erase-field.test.js
 *
 * POR QUE ESTE TESTE EXISTE (ago/2026):
 * Relato da Ana Paula Schmidt: ela apagava a data de nascimento do perfil,
 * salvava, e a data VOLTAVA. Não era bug de gravação — era a regra em vigor.
 * Desde a v0.16.6/v0.16.9 o save monta o payload "só com campos não-vazios",
 * porque Firestore set({merge:true}) preserva o campo OMITIDO. Isso fechou o
 * buraco real em que uma race (formulário lido antes do perfil carregar)
 * apagava o perfil inteiro — mas, do jeito que ficou, "vazio" só tinha uma
 * leitura possível: preservar. Apagar virou impossível.
 *
 * O que faltava era saber POR QUE o campo está vazio. Agora existe o BASELINE:
 * o que o formulário MOSTROU quando foi preenchido na tela. Com ele:
 *   estava preenchido na tela + vazio agora  → a PESSOA apagou  → apaga
 *   vazio nos dois lados (não hidratou/race) → preserva (proteção intacta)
 *
 * A primeira seção roda a função REAL extraída de js/views/auth.js. A segunda
 * é estrutural: trava a FIAÇÃO que a função pura sozinha não prova — a
 * sentinela de exclusão chegando ao payload, o currentUser esquecendo o campo
 * (senão ele reaparece na tela sem nem passar pelo Firestore) e o baseline
 * sendo gravado na hidratação.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'auth.js'), 'utf8');

// ── Carrega a REGRA real, sem executar o arquivo inteiro ────────────────────
const mList = src.match(/window\._PROFILE_ERASABLE = \[[\s\S]*?\];/);
const mFn = src.match(/window\._profileFieldsToErase = function[\s\S]*?\n};/);
if (!mList || !mFn) {
  console.error('✗ _PROFILE_ERASABLE / _profileFieldsToErase não encontrados em js/views/auth.js');
  process.exit(1);
}
const sandbox = { window: {}, console };
vm.createContext(sandbox);
vm.runInContext(mList[0] + '\n' + mFn[0], sandbox);
const erase = sandbox.window._profileFieldsToErase;

console.log('──── a regra: apagar é um ato, race não é ────');

// O CASO DA ANA PAULA. Pré-fix isto era impossível de expressar: o save via
// só "vazio" e preservava sempre. Aqui tem que sair birthDate NA LISTA.
{
  const out = erase({ birthDate: '10/03/1980', gender: 'feminino', city: 'Sorocaba' },
                    { birthDate: '', gender: 'feminino', city: 'Sorocaba' });
  ok(out.indexOf('birthDate') !== -1, 'data apagada na tela entra na lista de exclusão');
  ok(out.indexOf('age') !== -1, 'idade (derivada da data) é apagada junto');
  ok(out.indexOf('gender') === -1, 'gênero intocado não é apagado');
  ok(out.indexOf('city') === -1, 'cidade intocada não é apagada');
}

// A PROTEÇÃO QUE NÃO PODE CAIR: formulário que nunca hidratou (race da v0.16.6).
// Vazio nos dois lados = nada foi apagado = Firestore preserva.
{
  const out = erase({ birthDate: '', gender: '', city: '', preferredSports: [] },
                    { birthDate: '', gender: '', city: '', preferredSports: [] });
  ok(out.length === 0, 'formulário não hidratado não apaga NADA (proteção contra race intacta)');
}

// Baseline ausente (perfil aberto por um caminho que não hidratou o formulário):
// na dúvida, não apaga.
{
  ok(erase(null, { birthDate: '' }).length === 0, 'sem baseline: não apaga');
  ok(erase({ birthDate: '10/03/1980' }, null).length === 0, 'sem valores: não apaga');
}

// Erro de digitação NÃO é apagamento — o campo continua tendo conteúdo.
{
  const out = erase({ birthDate: '10/03/1980' }, { birthDate: '1' });
  ok(out.length === 0, 'data digitada pela metade não apaga (é typo, não exclusão)');
}

// Campo que a pessoa nunca preencheu e continua vazio: não há o que apagar.
{
  const out = erase({ birthDate: '', city: 'Sorocaba' }, { birthDate: '', city: 'Sorocaba' });
  ok(out.length === 0, 'campo sempre vazio não vira exclusão à toa');
}

// Vale pra todo campo opcional, não só pra data.
{
  const base = {
    gender: 'feminino', birthDate: '10/03/1980', city: 'Sorocaba',
    letzplayHandle: '@ana', preferredCeps: '18040-000',
    preferredSports: ['Beach Tennis'], preferredLocations: [{ label: 'Quadra' }]
  };
  const now = {
    gender: '', birthDate: '', city: '',
    letzplayHandle: '', preferredCeps: '',
    preferredSports: [], preferredLocations: []
  };
  const out = erase(base, now);
  ['gender', 'birthDate', 'city', 'letzplayHandle', 'preferredCeps',
   'preferredSports', 'preferredLocations', 'age'].forEach(function (k) {
    ok(out.indexOf(k) !== -1, 'campo apagável: ' + k);
  });
}

// Identidade e credencial NÃO são apagáveis por este caminho — apagar o nome
// deixaria a pessoa como "Usuário" pros outros; apagar e-mail/celular derrubaria
// o login. Os dois têm fluxo próprio (verificação / exclusão de conta).
{
  const list = sandbox.window._PROFILE_ERASABLE;
  ['displayName', 'name', 'email', 'phone', 'uid'].forEach(function (k) {
    ok(list.indexOf(k) === -1, k + ' NÃO está na lista de apagáveis');
  });
  const out = erase({ displayName: 'Ana Paula' }, { displayName: '' });
  ok(out.length === 0, 'nome esvaziado não é apagado (identidade)');
}

// Espaço em branco é vazio — "   " não conta como valor preservável.
{
  ok(erase({ city: 'Sorocaba' }, { city: '   ' }).indexOf('city') !== -1,
     'campo só com espaços conta como apagado');
}

console.log('──── o sintoma: o mesmo doc, sob as duas regras ────');

// Semântica do Firestore set({merge:true}): campo OMITIDO fica como está;
// campo com FieldValue.delete() é removido. É daqui que vinha o "a data volta".
const DELETE = { __delete__: true };
function applyMerge(doc, payload) {
  const out = Object.assign({}, doc);
  Object.keys(payload).forEach(function (k) {
    if (payload[k] === DELETE) delete out[k]; else out[k] = payload[k];
  });
  return out;
}
{
  const docNoBanco = { displayName: 'Ana Paula Schmidt', birthDate: '1980-03-10', age: 46, city: 'Sorocaba' };
  const baseline = { birthDate: '10/03/1980', city: 'Sorocaba' };
  const formAgora = { birthDate: '', city: 'Sorocaba' };

  // REGRA ANTIGA (v0.16.9): campo vazio = campo omitido do payload.
  const antigo = applyMerge(docNoBanco, { displayName: 'Ana Paula Schmidt', city: 'Sorocaba' });
  ok(antigo.birthDate === '1980-03-10',
     'REGRA ANTIGA reproduz o relato: a data continua no doc depois de apagada');

  // REGRA NOVA: a lista real da função sob teste vira sentinela de exclusão.
  const payload = { displayName: 'Ana Paula Schmidt', city: 'Sorocaba' };
  erase(baseline, formAgora).forEach(function (k) { payload[k] = DELETE; });
  const novo = applyMerge(docNoBanco, payload);
  ok(!('birthDate' in novo), 'REGRA NOVA: a data some do doc');
  ok(!('age' in novo), 'REGRA NOVA: a idade derivada some junto');
  ok(novo.city === 'Sorocaba', 'REGRA NOVA: o resto do perfil fica intacto');
  ok(novo.displayName === 'Ana Paula Schmidt', 'REGRA NOVA: o nome fica intacto');
}

console.log('──── a fiação: da regra até o Firestore e de volta pra tela ────');

// (1) A hidratação grava o baseline — sem isso a regra acima nunca dispara.
ok(/window\._profileFormBaseline = \{/.test(src),
   '_populateProfileModalFields grava _profileFormBaseline');
ok(/_profileFormBaseline[\s\S]{0,600}birthDate:/.test(src),
   'baseline inclui a data de nascimento');

// (2) O save aplica a sentinela de exclusão do Firestore no payload. Sem ela o
// campo seria só omitido — exatamente o comportamento que fazia a data voltar.
const mSave = src.match(/_erased = window\._profileFieldsToErase\([\s\S]*?\}\);[\s\S]{0,400}/);
ok(!!mSave, 'saveUserProfile chama _profileFieldsToErase');
ok(/FieldValue\.delete\(\)/.test(src),
   'save usa firebase.firestore.FieldValue.delete() (merge sozinho não apaga)');
ok(/_erased\.forEach\(function \(k\) \{ payload\[k\] = _delSentinel; \}\);/.test(src),
   'campos apagados entram no payload como sentinela de exclusão');
ok(/birthDate: birthRaw/.test(src),
   'a decisão usa birthRaw (texto na tela), não a data já convertida');

// (3) Depois de gravar, o currentUser precisa ESQUECER o campo. O readback só
// traz o que existe — campo apagado não vem, e sem o delete explícito o valor
// velho continuaria na memória da sessão e reapareceria ao reabrir o perfil.
ok(/_erased\.forEach\(function\(k\) \{[\s\S]{0,160}delete cu\[k\]/.test(src),
   'currentUser esquece os campos apagados após o readback');
ok(/_erased\.length > 0 && window\._userProfileCache[\s\S]{0,120}delete window\._userProfileCache\[uid\]/.test(src),
   'cache de perfis por uid é invalidado (idade/gênero em inscrição e sorteio)');

// (4) A conferência de round-trip não pode acusar divergência falsa: comparar a
// sentinela com o valor lido daria "divergência" em todo apagamento.
ok(/if \(_erased\.indexOf\(k\) !== -1\) \{[\s\S]{0,300}mismatch\.push/.test(src),
   'round-trip trata campo apagado como "tem que NÃO existir"');

console.log('\n' + (fail === 0 ? '✅' : '❌') + '  ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);

/* QUEM TEM UID É GRAVADO SÓ COMO UID — nenhum campo de perfil vai junto.
 * node tests/uid-entry-no-profile-copy.test.js
 *
 * POR QUE ESTE TESTE EXISTE (ago/2026):
 * Regra do dono, repetida: "não deveria gravar nada além do uid em torneios e
 * resolver conforme". O cliente já cumpria — identity-core._stripUidEntryNames
 * remove os campos de PERFIL no choke point do saveTournament. Mas o SERVIDOR
 * não passa por lá, e três construtores de entrada copiavam o perfil na mão:
 *   functions/enroll-core.pairPartnerSolo   (desinscrição que desfaz a dupla)
 *   functions/pair-core.solo                (desfazer dupla)
 *   js/views/tournaments._pairPartnerSolo   (mesmo caminho no cliente)
 *
 * MEDIDO EM PRODUÇÃO antes do fix: 143 entradas com uid, 2 sujas —
 *   {uid, email, ligaActive} e {uid, email, gender, skillBySport, enrollSeq, ...},
 * as duas de uid com perfil VIVO (Rodrigo Godinho e Nelson Barth). Ou seja: não é
 * "uid órfão sem perfil pra reidratar", é cópia mesmo.
 *
 * O argumento que justifica preservar o NOME (sem perfil, o nome é a última âncora
 * de identidade de um uid órfão) NÃO se estende a email/gender/birthDate/photo:
 * esses nunca identificam ninguém e o app já os resolve pelo uid. Guardar cópia só
 * cria um segundo lugar onde o dado da pessoa vive — e que "apagar do perfil" não
 * alcança. Foi exatamente o risco no caso da data de nascimento da Ana Paula.
 *
 * Os três construtores rodam AQUI, de verdade, pelos caminhos públicos.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let pass = 0, fail = 0;
function ok(c, m) { if (c) pass++; else { fail++; console.error('  ✗', m); } }

const ROOT = path.join(__dirname, '..');
const enrollCore = require(path.join(ROOT, 'functions', 'enroll-core.js'));
const pairCore = require(path.join(ROOT, 'functions', 'pair-core.js'));

// Campos que NUNCA podem acompanhar uma entrada com uid.
const PERFIL = ['email', 'phone', 'gender', 'birthDate', 'skillBySport', 'defaultCategory', 'photoURL'];
function sujeira(o) {
  if (!o || typeof o !== 'object') return [];
  return PERFIL.filter(function (k) { return o[k] !== undefined && o[k] !== null && o[k] !== ''; });
}

// Dupla "suja" como as que existem no banco: perfil copiado nos dois lados.
function duplaSuja() {
  return {
    p1Uid: 'uid-ana', p1Name: 'Ana Paula Schmidt', p1Seq: '44',
    p1Email: 'paulinhasc@uol.com.br', p1Gender: 'feminino', p1BirthDate: '1975-12-01',
    p1Photo: 'https://exemplo/foto.jpg',
    p2Uid: 'uid-nelson', p2Name: 'Nelson Barth', p2Seq: '3',
    p2Email: 'ntbarth@gmail.com', p2Gender: 'masculino', p2BirthDate: '1950-01-02',
    name: 'Ana Paula Schmidt / Nelson Barth',
    category: 'Misto', categories: ['Misto'], categorySource: 'perfil'
  };
}

console.log('──── desinscrição que desfaz a dupla (functions/enroll-core) ────');
{
  const r = enrollCore.computeDeenroll({ participants: [duplaSuja()] }, 'uid-ana');
  const restantes = (r.updateData && r.updateData.participants) || r.participants || [];
  const solo = restantes.filter(function (p) { return p && p.uid === 'uid-nelson'; })[0];
  ok(!!solo, 'o parceiro continua no torneio como solo');
  ok(sujeira(solo).length === 0,
     'solo do parceiro sai SEM campo de perfil (vazou: ' + sujeira(solo).join(',') + ')');
  ok(solo && solo.uid === 'uid-nelson', 'identidade do solo é o uid');
  ok(solo && solo.enrollSeq === '3', 'nº de inscrição é DO TORNEIO — continua herdado');
  ok(solo && solo.category === 'Misto', 'categoria é DO TORNEIO — continua herdada');
  ok(!restantes.some(function (p) { return p && p.uid === 'uid-ana'; }), 'quem saiu não ficou em slot nenhum');
}

console.log('──── desfazer dupla (functions/pair-core) ────');
{
  const r = pairCore.computeSplitPair({ participants: [duplaSuja()] }, { id1: 'uid-ana', id2: 'uid-nelson' });
  const arr = (r.updateData && r.updateData.participants) || r.participants || [];
  const s1 = arr.filter(function (p) { return p && p.uid === 'uid-ana'; })[0];
  const s2 = arr.filter(function (p) { return p && p.uid === 'uid-nelson'; })[0];
  ok(!!s1 && !!s2, 'desfazer gera os dois solos');
  ok(sujeira(s1).length === 0, 'solo 1 sem campo de perfil (vazou: ' + sujeira(s1).join(',') + ')');
  ok(sujeira(s2).length === 0, 'solo 2 sem campo de perfil (vazou: ' + sujeira(s2).join(',') + ')');
  ok(s1 && s1.enrollSeq === '44' && s2 && s2.enrollSeq === '3', 'cada um herda o próprio nº de inscrição');
}

console.log('──── mesmo caminho no cliente (js/views/tournaments) ────');
{
  const src = fs.readFileSync(path.join(ROOT, 'js', 'views', 'tournaments.js'), 'utf8');
  const m = src.match(/window\._pairPartnerSolo = function \(entry, n\) \{[\s\S]*?\n\};/);
  ok(!!m, '_pairPartnerSolo existe em js/views/tournaments.js');
  const sb = { window: {}, console };
  vm.createContext(sb);
  vm.runInContext(m[0], sb);
  const solo = sb.window._pairPartnerSolo(duplaSuja(), 2);
  ok(sujeira(solo).length === 0,
     'cliente: solo sem campo de perfil (vazou: ' + sujeira(solo).join(',') + ')');
  ok(solo && solo.uid === 'uid-nelson', 'cliente: identidade é o uid');
  ok(solo && solo.enrollSeq === '3', 'cliente: nº de inscrição herdado');

  // FICTÍCIO é a única exceção: sem uid, o nome É a identidade — volta como string.
  const fict = sb.window._pairPartnerSolo({ p1Uid: 'uid-ana', p1Name: 'Ana', p2Name: 'Convidado' }, 2);
  ok(fict === 'Convidado', 'fictício sem conta continua sendo a string do nome');
}

console.log('──── o strip do save continua sendo a última barreira ────');
{
  const idsrc = fs.readFileSync(path.join(ROOT, 'js', 'views', 'identity-core.js'), 'utf8');
  const mf = idsrc.match(/var _PROFILE_FIELDS = \[[^\]]*\];/);
  ok(!!mf, '_PROFILE_FIELDS existe em identity-core.js');
  PERFIL.forEach(function (k) {
    ok(mf && mf[0].indexOf("'" + k + "'") !== -1, 'strip do save cobre ' + k);
  });
}

console.log('\n' + (fail === 0 ? '✅' : '❌') + '  ' + pass + ' passaram, ' + fail + ' falharam');
process.exit(fail === 0 ? 0 : 1);

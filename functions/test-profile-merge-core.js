'use strict';
/* Testa functions/profile-merge-core.js — "nada se perde" na união de contas.
 * Rodar:  node functions/test-profile-merge-core.js
 *
 * O DEFEITO QUE ISTO TRAVA (medido em produção, 04/ago/2026): o merge movia torneios,
 * matchHistory e partidas casuais e NÃO copiava NENHUM campo de perfil. Caso real na base:
 * Silvia Moura Ferreira tem duas contas vivas — `password`/silvmou@gmail.com com 44 campos
 * e `apple.com` com e-mail oculto (relay) com 17. Pela regra de sobrevivência a federada
 * vence, então o merge manteria a de 17 campos e os 44 evaporariam.
 *
 * A regra é VARREDURA GENÉRICA com lista de EXCLUSÃO — não lista campo a campo, que
 * apodrece (campo novo no perfil nasceria fora da lista e voltaria a se perder calado).
 * Mesma lição do _repairTournaments. */
const P = require('./profile-merge-core');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name + (extra ? '  → ' + extra : '')); } }
const merge = P.computeProfileMerge;

// ── O CASO REAL: sobrevivente POBRE absorve o perfil RICO ─────────────────────
(() => {
  const rica = { // silvmou@gmail.com — a que MORRE pela regra de sobrevivência
    displayName: 'Silvia Moura Ferreira', email: 'silvmou@gmail.com',
    gender: 'feminino', birthDate: '1975-04-12', city: 'São Paulo', state: 'SP',
    skillBySport: { 'Beach Tennis': 'B', 'Tênis': 'C' },
    preferredSports: ['Beach Tennis', 'Tênis'], preferredCeps: ['04533-010'],
    photoURL: 'https://firebasestorage.../silvia.jpg', letzplayHandle: '@silvia',
    notifyLevel: 'importantes', createdAt: '2026-05-03T10:00:00Z',
  };
  const pobre = { // Apple relay — a que SOBREVIVE
    displayName: 'Silvia Moura Ferreira', email: 'cv85pnkf5y@privaterelay.appleid.com',
    createdAt: '2026-07-17T10:00:00Z', authProvider: 'apple.com',
  };
  const upd = merge(pobre, rica, 'uid_apple');
  ok('gênero é absorvido', upd.gender === 'feminino');
  ok('data de nascimento é absorvida', upd.birthDate === '1975-04-12');
  ok('cidade é absorvida', upd.city === 'São Paulo');
  ok('foto é absorvida', /silvia\.jpg$/.test(upd.photoURL || ''));
  ok('habilidade por modalidade é absorvida',
    upd.skillBySport && upd.skillBySport['Beach Tennis'] === 'B' && upd.skillBySport['Tênis'] === 'C');
  ok('modalidades preferidas são absorvidas', (upd.preferredSports || []).length === 2);
  ok('handle do letzplay é absorvido', upd.letzplayHandle === '@silvia');

  // O que NÃO pode viajar junto
  ok('NOME não é copiado (o sobrevivente mantém a identidade dele)', !('displayName' in upd));
  ok('E-MAIL não é copiado (quem move credencial é o Auth)', !('email' in upd));
  ok('createdAt não é copiado (é critério de merge — mexer envenena decisões futuras)',
    !('createdAt' in upd));
})();

// ── O sobrevivente NUNCA perde valor vivo ────────────────────────────────────
(() => {
  const keep = { city: 'Sorocaba', gender: 'masculino', skillBySport: { 'Tênis': 'A' } };
  const drop = { city: 'São Paulo', gender: 'feminino', skillBySport: { 'Tênis': 'D', 'Padel': 'C' } };
  const upd = merge(keep, drop, 'u1');
  ok('cidade viva do sobrevivente prevalece', !('city' in upd));
  ok('gênero vivo do sobrevivente prevalece', !('gender' in upd));
  ok('objeto: chave existente do keep vence', upd.skillBySport['Tênis'] === 'A');
  ok('objeto: chave NOVA do drop entra', upd.skillBySport['Padel'] === 'C');
})();

// ── Arrays: união sem duplicar, preservando a ordem do sobrevivente ──────────
(() => {
  const keep = { preferredSports: ['Tênis'], linkedEmails: ['a@x.com'], friends: ['uA'] };
  const drop = { preferredSports: ['Padel', 'Tênis'], linkedEmails: ['b@x.com', 'a@x.com'], friends: ['uB', 'uA'] };
  const upd = merge(keep, drop, 'uKeep');
  ok('união de modalidades sem duplicar', JSON.stringify(upd.preferredSports) === JSON.stringify(['Tênis', 'Padel']));
  ok('união de e-mails vinculados', JSON.stringify(upd.linkedEmails) === JSON.stringify(['a@x.com', 'b@x.com']));
  ok('união de amigos sem duplicar', JSON.stringify(upd.friends) === JSON.stringify(['uA', 'uB']));
  ok('array sem novidade não vira write', merge({ preferredSports: ['Tênis', 'Padel'] }, { preferredSports: ['Padel'] }, 'u').preferredSports === undefined);
})();

// ── Auto-amizade: o sobrevivente não pode virar amigo de si mesmo ────────────
(() => {
  const upd = merge({ friends: ['uX'] }, { friends: ['uKeep', 'uY'] }, 'uKeep');
  ok('o uid do sobrevivente é filtrado da lista de amigos', (upd.friends || []).indexOf('uKeep') === -1);
  ok('o resto dos amigos entra', JSON.stringify(upd.friends) === JSON.stringify(['uX', 'uY']));
})();

// ── Campos que NUNCA viajam ──────────────────────────────────────────────────
(() => {
  const drop = {
    mergedInto: 'uOutro', mergedAt: 'x',        // prova de merge → sequestro de conta
    plan: 'pro', planExpiresAt: '2027-01-01',   // assinatura: só o webhook do Stripe concede
    displayName: 'Fulano', displayName_lower: 'fulano',
    email: 'e@x.com', phone: '+5511999999999', phoneCountry: '55',
    fcmToken: 'tok', uid: 'uDrop', matchHistory: [{ matchId: 'm1' }],
    city: 'Campinas',
  };
  const upd = merge({}, drop, 'uKeep');
  ['mergedInto', 'mergedAt', 'plan', 'planExpiresAt', 'displayName', 'displayName_lower',
   'email', 'phone', 'phoneCountry', 'fcmToken', 'uid', 'matchHistory'].forEach(function (k) {
    ok('NUNCA copia ' + k, !(k in upd));
  });
  ok('mas copia o resto (city)', upd.city === 'Campinas');
})();

// ── Vazio não apaga, e false/0 são VALORES ──────────────────────────────────
(() => {
  ok('string vazia do drop não vira write', !('city' in merge({}, { city: '   ' }, 'u')));
  ok('null do drop não vira write', !('gender' in merge({}, { gender: null }, 'u')));
  ok('false do drop É valor e é copiado', merge({}, { notifyEmail: false }, 'u').notifyEmail === false);
  ok('0 do drop É valor e é copiado', merge({}, { sitOutPoints: 0 }, 'u').sitOutPoints === 0);
  ok('false vivo no keep NÃO é sobrescrito', !('notifyEmail' in merge({ notifyEmail: false }, { notifyEmail: true }, 'u')));
  ok('nada a fazer devolve objeto vazio', Object.keys(merge({ city: 'SP' }, { city: 'RJ' }, 'u')).length === 0);
})();

// ── Campo NOVO no perfil é preservado por padrão (a razão da lista de exclusão) ──
(() => {
  const upd = merge({}, { campoQueAindaNaoExiste: 'valor', outroNovo: ['a'] }, 'u');
  ok('campo desconhecido é absorvido sem ninguém atualizar lista', upd.campoQueAindaNaoExiste === 'valor');
  ok('array desconhecido também', JSON.stringify(upd.outroNovo) === JSON.stringify(['a']));
})();

// ── Fiação: o index.js usa o módulo de verdade ───────────────────────────────
(() => {
  const fs = require('fs'), path = require('path');
  const src = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  ok('index.js importa profile-merge-core', /require\(["']\.\/profile-merge-core["']\)/.test(src));
  ok('_executeMerge chama computeProfileMerge', src.includes('_profileMerge.computeProfileMerge('));
  const bloco = src.slice(src.indexOf('async function _executeMerge'), src.indexOf('async function _mergeAccountsKeepOlder'));
  ok('a união do perfil acontece DENTRO do _executeMerge (o caminho comum de toda fusão)',
    bloco.includes('computeProfileMerge('));
  ok('grava num update só (perfil + matchHistory juntos)', /profileUpd\.matchHistory\s*=/.test(bloco));
})();

console.log(fail === 0
  ? '✅ profile-merge-core: ' + pass + ' ok, 0 falharam'
  : '❌ profile-merge-core: ' + fail + ' falharam, ' + pass + ' ok');
process.exit(fail === 0 ? 0 : 1);

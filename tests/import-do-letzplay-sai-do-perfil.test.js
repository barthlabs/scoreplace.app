'use strict';
/* ⛔ MEIO MEGABYTE DENTRO DE UM DOCUMENTO DE PERFIL.
 *
 * MEDIDO em 13/set/2026 na produção: `letzplayImport` — a partida a partida trazida da outra
 * plataforma — mora DENTRO de `users/{uid}`. São **18 dos 279 perfis**, **2.292 jogos
 * somados**, e o MAIOR ocupa **499 KB num único documento**. O Firestore entrega o documento
 * INTEIRO ou nada, então qualquer leitura da ficha dessas 18 pessoas paga isso — inclusive o
 * próprio dono, a cada login.
 *
 * ⛔ E PÔR NO ESPELHO PÚBLICO SERIA PIOR: o espelho é lido em LOTE pela chave e pela busca
 * (dezenas de documentos por tela). Meio megabyte lá multiplicaria o problema.
 *
 * ⭐ Vai para documento próprio, buscado só por quem pede — a mesma saída das partes pesadas
 * do torneio. E a migração é em DOIS TEMPOS: copiar primeiro, apagar o campo só depois de a
 * versão nova estar no ar. Publicar os dois juntos deixaria um app antigo sem import nenhum
 * entre o deploy e o reload.
 */
const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const raiz = path.join(__dirname, '..');
const C = require(path.join(raiz, 'functions/letzplay-import-core.js'));
let ok = 0;
const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const codigo = (f) => fs.readFileSync(path.join(raiz, f), 'utf8')
  .split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

console.log('\n──── o import do letzplay sai do perfil ────\n');

// ── ① o lugar é um só ──────────────────────────────────────────────────────
must(C.caminhoDoImport('u1').path === 'users/u1/letzplay/import',
  '① o caminho do import é único e derivado (' + C.caminhoDoImport('u1').path + ')');

// ── ② a leitura aceita as duas formas, e o documento PRÓPRIO vence ─────────
must(C.escolherImport({ games: [1] }, { games: [1, 2] }).games.length === 1,
  '② ⭐ o documento próprio VENCE o campo antigo — senão a migração nunca termina');
must(C.escolherImport(null, { games: [1, 2] }).games.length === 2,
  '② quem ainda não migrou continua servido pelo campo do perfil');
must(C.escolherImport(null, null) === null, '② e sem nenhum dos dois, é nulo');
must(!C.precisaMover({ letzplayImport: { games: [] } }),
  '② import vazio não é movido — não se cria documento à toa');

// ── ③ os leitores REAIS passam pela porta ─────────────────────────────────
const DB = codigo('js/firebase-db.js');
must(/async carregarLetzplayImport\(uid, perfilJaLido\)/.test(DB),
  '③ existe UMA porta de leitura do import');
must(/collection\('letzplay'\)\.doc\('import'\)/.test(DB),
  '③ ⭐ e ela busca o documento próprio');
const AN = codigo('js/views/tournaments-analytics.js');
must(/carregarLetzplayImport\(resolvedUid\)/.test(AN),
  '③ ⭐ a ficha de TERCEIRO pede o import pela porta…');
must(!/collection\('users'\)/.test(AN),
  '③ ⭐⭐ …e não lê mais NENHUMA ficha inteira — era a última deste arquivo');

// ── ④ a escrita vai para o documento próprio ──────────────────────────────
const ST = codigo('js/store.js');
must(/collection\('letzplay'\)\.doc\('import'\)\s*\n?\s*\.set\(_impParaSubdoc\)/.test(ST),
  '④ ⭐ o import gravado pelo scan vai para o documento próprio');
must(!/patch\.letzplayImport = fi;/.test(ST),
  '④ ⛔ e NÃO entra mais no patch do perfil');

// ── ⑤ a Rule existe, e a escrita é só do dono ─────────────────────────────
const RULES = fs.readFileSync(path.join(raiz, 'firestore.rules'), 'utf8');
const i = RULES.indexOf('match /letzplay/{docId}');
must(i > 0, '⑤ a subcoleção tem regra — sem ela o Firestore nega por omissão e o card some');
const bloco = RULES.slice(i, RULES.indexOf('}', RULES.indexOf('allow write', i)));
must(/allow read: if request\.auth != null;/.test(bloco),
  '⑤ leitura de qualquer autenticado — como já era dentro do perfil; mover não expõe mais nada');
must(/allow write: if request\.auth != null && request\.auth\.uid == userId;/.test(bloco),
  '⑤ ⭐ escrita SÓ do dono — o import é prova de posse da conta da outra plataforma');

// ── ⑥ a migração é em dois tempos, e confere antes de apagar ──────────────
const MIG = codigo('scripts/mover-letzplay-import.js');
must(/--apagar/.test(MIG) && /APAGAR/.test(MIG),
  '⑥ apagar o campo antigo é um passo SEPARADO');
must(/const conf = await ref\.get\(\)/.test(MIG) && /NÃO apaguei/.test(MIG),
  '⑥ ⭐ e ele RELÊ o documento próprio antes de apagar — perder o import de alguém não tem volta');
must(/games\.length === p\.letzplayImport\.games\.length/.test(MIG),
  '⑥ a conferência é por CONTAGEM de jogos, não por "existe"');

console.log('\n✅ ' + ok + ' verificações');

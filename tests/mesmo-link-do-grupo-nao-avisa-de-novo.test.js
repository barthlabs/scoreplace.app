'use strict';
/* ⛔ SALVAR O MESMO LINK DE NOVO NÃO É NOTÍCIA.
 *
 * MEDIDO em produção (12/set/2026, leitura direta do Firestore):
 *   • users/ux8v6…/notifications — "Rodrigo Barth criou o grupo de whats do jogo
 *     «Livia Morais / Rodrigo Barth vs Inga / Denise Soares»" chegou DUAS vezes à
 *     mesma pessoa: 02/set 17:59 e 03/set 16:13. Um grupo, um jogo, dois avisos.
 *   • mail/ — a versão de agosto do mesmo aviso saiu TRÊS vezes para liviamtsm@ e
 *     lorainediaferia@: 03/ago 00:19, 00:39 e 13:34, corpo idêntico caractere a caractere.
 *
 * POR QUE VAZAVA: `_notifyOthers` disparava em TODO save bem-sucedido. O único freio era
 * `_notifDedupCheck`, de 5 MINUTOS e guardado na MEMÓRIA da aba — recarregou, ou era outro
 * aparelho, e ele nunca viu o primeiro envio. Vinte minutos depois, vinte e duas horas
 * depois, a mesma frase saía de novo. [[feedback_a_defesa_vaza_pela_borda]]
 *
 * A REGRA AGORA É O DADO: mudou o link, é notícia; não mudou, ninguém é avisado. O reenvio
 * DE PROPÓSITO continua existindo, pelo botão "Notificar participantes".
 */
const assert = require('assert/strict'), fs = require('fs'), path = require('path');
const raiz = path.join(__dirname, '..');
const WA = fs.readFileSync(path.join(raiz, 'js/views/wa-group.js'), 'utf8');
let ok = 0; const must = (v, m) => { assert.ok(v, m); ok++; console.log('  ✓ ' + m); };
const semComentario = (s) => s.split('\n').filter((l) => !/^\s*(\*|\/\/|\/\*)/.test(l)).join('\n');

// ── âncoras: o corpo do salvar ──────────────────────────────────────────────
const ini = WA.indexOf('window._waGrpSaveLink = function');
assert.ok(ini > 0, 'âncora: o salvar do link do grupo');
const fim = WA.indexOf('window._waGrpNotifyParticipants = function', ini);
assert.ok(fim > ini, 'âncora: o fim do salvar (começa o reenvio manual)');
const salvar = semComentario(WA.slice(ini, fim));

// ── ① a decisão existe e é tirada do dado, não do relógio ───────────────────
must(/var _linkMudou\s*=/.test(salvar), '① o salvar decide se houve mudança de link');
must(/prev && prev\.link/.test(salvar), '① e compara com o link que JÁ ESTAVA lá');
must(!/_linkMudou[\s\S]*Date\.now\(\)\s*-/.test(salvar),
  '① ⛔ a decisão não é por tempo — janela de minutos foi exatamente o que vazou');

// ── ② a decisão, EXECUTADA ──────────────────────────────────────────────────
const linhas = salvar.split('\n').filter((l) => /_linkAnterior\s*=|_linkMudou\s*=/.test(l)).join('\n');
assert.ok(/_linkAnterior/.test(linhas) && /_linkMudou/.test(linhas), 'âncora: as duas linhas da decisão');
const decide = new Function('prev', 'link', linhas.replace(/^\s*var /gm, 'var ') + '\n return _linkMudou;');
const L = 'https://chat.whatsapp.com/ABC123';
must(decide({ link: L }, L) === false, '② mesmo link salvo de novo ⇒ NÃO avisa');
must(decide({ link: '  ' + L + ' ' }, L) === false, '② espaço em volta não inventa mudança');
must(decide({ link: L }, 'https://chat.whatsapp.com/XYZ999') === true, '② link TROCADO ⇒ avisa');
must(decide(null, L) === true, '② primeira vez (não havia grupo) ⇒ avisa');
must(decide({}, L) === true, '② registro sem link ⇒ avisa');
must(decide({ link: '' }, L) === true, '② link vazio ⇒ avisa');

// ── ③ o aviso está DE FATO atrás da decisão ─────────────────────────────────
must(/if \(_linkMudou\) \{ try \{ _notifyOthers\(ctx\); \} catch/.test(salvar),
  '③ o disparo do aviso está dentro da decisão');
must(!/(^|[^)]\s)try \{ _notifyOthers\(ctx\); \} catch \(e\) \{\}/.test(salvar.replace(/if \(_linkMudou\) \{ try \{ _notifyOthers\(ctx\); \} catch \(e\) \{\} \}/g, '')),
  '③ ⛔ não sobrou disparo solto no salvar — seria a porta velha de volta');

// ── ④ o reenvio DE PROPÓSITO continua existindo ─────────────────────────────
const manual = semComentario(WA.slice(WA.indexOf('window._waGrpNotifyParticipants = function')));
must(/_notifyOthers\(ctx\)/.test(manual),
  '④ o botão "Notificar participantes" segue avisando quando o organizador PEDE');
must(!/_linkMudou/.test(manual),
  '④ ⛔ e não ficou preso à mudança de link — reenviar é justamente mandar o mesmo de novo');

console.log('\n✅ mesmo link do grupo não avisa de novo — ' + ok + ' verificações');

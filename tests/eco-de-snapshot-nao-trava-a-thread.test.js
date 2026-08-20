/* O ECO DE SNAPSHOT NÃO TRAVA MAIS A THREAD
 * node tests/eco-de-snapshot-nao-trava-a-thread.test.js
 *
 * MEDIDO NO APARELHO DO DONO (Sentry, build 78, 19/ago/2026): travadas de ~1,2s
 * REPETIDAS ("574ms@-2.4s | 1197ms@-1s | 1193ms@0.3s") com "trechos: nenhum" — a
 * tarefa sem nome era o listener de torneios: a CADA eco (presença/placar de
 * QUALQUER participante) ele (a) re-desserializava TODOS os docs via doc.data()
 * (o do Confra passa de meio MB) e (b) gravava o cache inteiro em localStorage
 * com JSON.stringify SÍNCRONO. Era o vácuo do toque ("2-3s pra aparecer o
 * carregando") e parte do corte no scroll.
 *
 * O que este teste trava (1.9.79):
 *   1. só o doc que MUDOU paga doc.data() — os demais REUSAM o objeto em memória
 *      (docChanges → _mudou; falhou → parse total, comportamento antigo);
 *   2. o caminho quente NÃO chama _saveToCache direto — agenda (_agendarSaveCache);
 *   3. o agendamento é por RAJADA (debounce 2s) com FLUSH ao ir pro fundo
 *      (pagehide + visibilitychange hidden) — o cache é pro PRÓXIMO boot;
 *   4. o callback é MEDIDO ('snapshot-torneios') — travada futura terá NOME;
 *   5. a hidratação R/R roda só nos docs re-parseados (os reusados já têm refs).
 */
const fs = require('fs');
const path = require('path');
const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };

console.log('──── eco de snapshot não trava a thread ────');

const iFn = src.indexOf('function _aplicaSnapTorneios');
ok(iFn > 0, 'o corpo do listener é uma função NOMEADA (_aplicaSnapTorneios)');
const fim = src.indexOf('this._realtimeUnsubscribe = query', iFn);
const corpo = src.slice(iFn, fim);

// 1. reuso incremental
ok(/snap\.docChanges\(\)\.forEach\(function \(c\) \{ _mudou\[c\.doc\.id\] = true; \}\)/.test(corpo),
   'o conjunto de docs MUDADOS vem de docChanges');
ok(/_mudou && !_mudou\[doc\.id\] && _prevParsed\[doc\.id\]/.test(corpo),
   'doc NÃO mudado reusa o objeto em memória (não paga doc.data())');
ok(/\} catch \(eDc\) \{ _mudou = null; \}/.test(corpo),
   'docChanges falhou → parse total (rede: nunca menos dado que antes)');
ok(!/var data = doc\.data\(\);\n/.test(corpo.replace(/data = doc\.data\(\);\n\s*_reparseados/, '')),
   'não sobrou parse incondicional no forEach');

// 2 + 3. cache fora do caminho quente
ok(/store\._agendarSaveCache\(\);/.test(corpo), 'o eco AGENDA a gravação do cache');
ok(!/store\._saveToCache\(\);/.test(corpo), 'o eco NÃO grava o cache sincronamente');
const iAg = src.indexOf('_agendarSaveCache() {');
ok(iAg > 0, 'existe _agendarSaveCache');
const ag = src.slice(iAg, src.indexOf('_loadFromCache() {', iAg));
ok(/setTimeout\(function \(\) \{[\s\S]*?_saveToCache\(\);[\s\S]*?\}, 2000\)/.test(ag),
   'gravação por rajada: debounce de 2s');
ok(/pagehide/.test(ag) && /visibilitychange/.test(ag) && /hidden/.test(ag),
   'flush garantido quando o app vai pro fundo (o cache é pro próximo boot)');
ok(/_medirTrecho\('cache-torneios'/.test(ag), 'a gravação é MEDIDA (cache-torneios)');

// 4. o callback é medido
ok(/_medirTrecho\('snapshot-torneios', function \(\) \{ _aplicaSnapTorneios\(snap\); \}\)/.test(src),
   'o listener é MEDIDO (snapshot-torneios) — travada futura terá nome');

// 5. hidratação R/R seletiva
ok(/\(_reparseados\.length \? _reparseados : tournaments\)\.forEach/.test(corpo),
   'a hidratação R/R roda só nos docs re-parseados');

console.log(`\n  ${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);

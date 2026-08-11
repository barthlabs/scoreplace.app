#!/usr/bin/env node
/* A TELA NUNCA CULPA O LETZPLAY — e esta é a SEGUNDA vez que a regra precisa valer.
 *
 * ORDEM DO DONO, 14/jul/2026: nenhuma frase da leitura pode mencionar limite/bloqueio do
 * letzplay — o problema é NOSSO. Quem clicou "puxar histórico" não tem o que fazer com "o
 * letzplay limitou o acesso": não é ação, é desculpa, e o efeito prático é a pessoa
 * desconfiar do app enquanto a leitura está indo bem.
 *
 * POR QUE ISTO É UMA TRAVA E NÃO UM COMENTÁRIO:
 *   • v1.6.11 (14/jul) — as frases foram removidas do overlay. Registrado no CLAUDE.md:
 *     "Nenhuma frase menciona limite/espera do letzplay — regra do dono".
 *   • v1.6.48 (31/jul) — EU as trouxe de volta, e ainda escrevi no código "O BLOQUEIO TEM
 *     QUE APARECER", justificando com um problema real (barra parada parece travada) mas
 *     resolvendo-o do jeito que o dono já tinha vetado.
 *   • 11/ago/2026 — ele reencontra a mesma frase, ao vivo, lendo o @GersomOtsu:
 *     _"e voltou essa merda de limitou acesso que já disse que não é pra ter."_
 * Duas reincidências com 17 dias de intervalo. Memória não segurou; exit code 1 segura.
 *
 * ⚠️ O QUE ESTE TESTE NÃO PROÍBE: a LÓGICA de espera. `_bloqueios`, `lz-throttle`, o
 * orçamento de paciência e o recuo de ritmo continuam existindo e são o que faz a leitura
 * sobreviver. O que não pode é VIRAR TEXTO NA TELA. Por isso a varredura ignora nomes de
 * variável e comentários, e olha só o que vai pro usuário.
 *
 * O SUBSTITUTO LEGÍTIMO para "parece travado" já está na tela e não acusa ninguém: o passo
 * em curso segue no subtítulo e o relógio de decorrido tica a cada segundo (v1.6.12).
 *
 * Uso:  node tests/lz-nao-culpa-o-letzplay.test.js
 */
'use strict';
const fs = require('fs');
const path = require('path');

const raiz = path.resolve(__dirname, '..');
let ok = 0, bad = 0;
function t(nome, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nome); }
  catch (e) { bad++; console.log('  ✗ ' + nome + '\n      ' + e.message); }
}

// Arquivos que desenham a leitura do letzplay pro usuário.
const ALVOS = [
  'js/views/tournaments-enrollment-report.js',
  'js/views/letzplay-onboarding.js',
  'js/views/letzplay-bridge.js',
  'js/views/letzplay-profile.js',
  'js/store.js'
];

// Só o que vira TEXTO: linhas de string, fora de comentário. Nome de variável (_bloqueios),
// chave de protocolo ('lz-throttle') e comentário não são tela.
function linhasDeTexto(src) {
  const out = [];
  src.split('\n').forEach((linha, i) => {
    const t = linha.trim();
    if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
    // corta comentário de fim de linha, preservando o que está dentro de aspas
    const semCom = linha.replace(/([^:'"])\/\/.*$/, '$1');
    // pega só o conteúdo entre aspas — é o que pode chegar na tela
    const strs = semCom.match(/'[^']*'|"[^"]*"|`[^`]*`/g) || [];
    strs.forEach((s) => out.push({ n: i + 1, s: s }));
  });
  return out;
}

// As formas que a frase já assumiu (as duas reincidências) + variações previsíveis.
const PROIBIDO = [
  { re: /letzplay\s+limit(ou|a|ando)/i, nota: 'culpa o letzplay por nome' },
  { re: /limitou\s+(o\s+acesso|as\s+leituras)/i, nota: 'a frase exata das duas reincidências' },
  { re: /\b403\b|\b429\b/, nota: 'código HTTP na cara do usuário — não é ação, é ruído' },
  { re: /rate\s*[-_]?\s*limit/i, nota: 'jargão de rate-limit visível' },
  { re: /bloqueou|bloqueando\s+(o\s+)?acesso/i, nota: 'acusa bloqueio' },
  { re: /esperando\s+'?\s*\+/i, nota: 'expõe a espera como evento ("esperando Xs")' }
];

console.log('\n1. NENHUM TEXTO DE TELA MENCIONA O LIMITE DO LETZPLAY');
ALVOS.forEach((rel) => {
  const p = path.join(raiz, rel);
  if (!fs.existsSync(p)) return;
  const achados = [];
  linhasDeTexto(fs.readFileSync(p, 'utf8')).forEach(({ n, s }) => {
    PROIBIDO.forEach((r) => { if (r.re.test(s)) achados.push(rel + ':' + n + '  ' + r.nota + '\n         ' + s.slice(0, 110)); });
  });
  t(rel, () => {
    if (achados.length) {
      throw new Error('a frase proibida voltou (' + achados.length + '):\n      ' + achados.join('\n      ') +
        '\n\n      Regra do dono desde 14/jul/2026: o problema é NOSSO. Se a tela parece parada,' +
        '\n      o conserto é MOSTRAR VIDA (passo em curso + relógio de decorrido), nunca dizer' +
        '\n      de quem é a culpa. Ver o cabeçalho deste arquivo — já voltou duas vezes.');
    }
  });
});

console.log('\n2. A LÓGICA DE ESPERA CONTINUA VIVA (o teste não proíbe o mecanismo)');
const rep = fs.readFileSync(path.join(raiz, 'js/views/tournaments-enrollment-report.js'), 'utf8');
t('o handler de lz-throttle existe', () => {
  if (!/lz-throttle/.test(rep)) throw new Error('o tratamento da espera sumiu — isso é o mecanismo, não a frase');
});
t('o contador de bloqueios continua alimentando o orçamento de paciência', () => {
  if (!/_bloqueios\s*\+\+/.test(rep)) throw new Error('_bloqueios++ sumiu; o orçamento de paciência depende dele');
});
t('e a espera NÃO acrescenta linha no feed', () => {
  const i = rep.indexOf("d.__sp_lp === 'lz-throttle'");
  if (i < 0) throw new Error('handler não encontrado');
  const bloco = rep.slice(i, i + 2200);
  if (/feedAdd/.test(bloco)) {
    throw new Error('a espera voltou a escrever no feed — era exatamente assim que a frase aparecia');
  }
});

console.log('\n3. O QUE SUBSTITUI: prova de vida sem acusar ninguém');
t('o passo em curso é preservado durante a espera', () => {
  const i = rep.indexOf("d.__sp_lp === 'lz-throttle'");
  const bloco = rep.slice(i, i + 2200);
  if (!/ultimaNota/.test(bloco)) {
    throw new Error('o passo deixou de ser preservado — a tela volta a ficar sem informação nenhuma');
  }
});
t('o relógio de decorrido existe (é ele que mostra que está vivo)', () => {
  if (!/sp-imp-eta|decorrido/.test(rep)) throw new Error('a linha de decorrido sumiu');
});

console.log('\n' + (bad ? '❌' : '✅') + ' lz-nao-culpa-o-letzplay: ' + ok + ' passaram, ' + bad + ' falharam');
process.exit(bad ? 1 : 0);

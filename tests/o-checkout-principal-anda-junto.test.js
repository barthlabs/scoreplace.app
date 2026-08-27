/* O CHECKOUT PRINCIPAL ANDA JUNTO COM O AR (leva 2.1.23)
 *
 * REGRA DO DONO (27/ago/2026), depois de achar o repo dele 16 commits atrás do ar:
 * _"que merda é esse dessa porra de repo nao acompanhar a merda da versao web? ja falei que
 * tudo tem que andar junto"_ · _"e faca disso a porra de uma regra para nunca mais
 * acontecer"_.
 *
 * ⚠️ A ARMADILHA É DO PRÓPRIO FLUXO DE WORKTREES, e ninguém erra comando: uma sessão
 * trabalha em .claude/worktrees/<nome>, empurra pro `main` e publica. O ar fica certo, o
 * `main` fica certo — e o CHECKOUT PRINCIPAL, que é onde o dono abre o projeto, fica
 * parado. MEDIDO no dia: ar e main em 2.1.22, o repo dele em 2.1.6.
 * É a mesma classe do incidente de 12/ago/2026 (produção 1.8.27 com main 1.8.24) que deu
 * origem ao check-deploy-alignment — e a resposta é a mesma: gate, não lembrete.
 *
 * ⛔ E O PREÇO É MAIOR QUE O SUSTO: o build de TestFlight/Play sai do checkout principal.
 * Repo atrasado empacota código velho com número novo — a loja diz uma coisa e o app faz
 * outra, que é o pior tipo de erro porque parece certo por fora.
 *
 * ⭐ FAST-FORWARD SÓ. Se o principal estiver noutro branch ou com trabalho não commitado,
 * o script AVISA e não decide por ninguém: alinhar não pode virar descartar o que outra
 * sessão estava fazendo.
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
console.log('──── o checkout principal anda junto ────');

const sh = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'deploy-hosting.sh'), 'utf8');

ok(/git worktree list --porcelain/.test(sh),
   '⛔ o deploy descobre o checkout PRINCIPAL (não assume que está rodando nele)');
ok(/merge --ff-only origin\/main/.test(sh),
   'e o alinha por fast-forward');

// ORDEM: só depois de o main ter sido atualizado — alinhar antes copiaria o estado velho
const iPush = sh.indexOf('git push origin "HEAD:main"');
const iAlinha = sh.indexOf('git worktree list --porcelain');
ok(iPush > 0 && iAlinha > iPush,
   'e isso acontece DEPOIS do push pro main (antes, copiaria o estado velho)');

// ⛔ as três recusas — alinhar não pode virar descartar trabalho alheio
const bloco = sh.slice(iAlinha - 200, iAlinha + 2200);
ok(/!= "main"/.test(bloco) && /NÃO mexi/.test(bloco),
   '⛔ principal noutro branch → avisa e NÃO mexe');
ok(/status --porcelain --untracked-files=no/.test(bloco),
   '⛔ principal com alterações não commitadas → avisa e NÃO mexe (trabalho de outra sessão não se descarta)');
ok(/untracked-files=no/.test(bloco),
   'e arquivo NÃO RASTREADO não conta como sujeira — ele sobrevive ao fast-forward e ' +
   'bloquear por causa dele deixaria o alinhamento sem acontecer justamente onde há rascunho');
ok(/dry-run: não alinhei/.test(bloco), 'o --dry-run não toca em nada');
ok(/já estava em dia/.test(bloco), 'e é no-op quando já está alinhado (o caso comum)');

// não pode ABORTAR o deploy: o ar já foi publicado / o main já foi empurrado
ok(!/exit 1/.test(bloco),
   '⛔ e NUNCA aborta o deploy por causa disto — neste ponto o main já foi empurrado, e ' +
   'derrubar a publicação por um checkout desalinhado trocaria um problema pequeno por um grande');

console.log(pass + ' ok, ' + fail + ' falhas');
process.exit(fail ? 1 : 0);

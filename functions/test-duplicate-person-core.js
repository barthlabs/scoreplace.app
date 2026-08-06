'use strict';
/* Testa functions/duplicate-person-core.js — "esta pessoa já não está inscrita?"
 * Rodar:  node functions/test-duplicate-person-core.js
 *
 * OS CASOS SÃO REAIS, medidos na base em 05/ago/2026 (185 contas vivas):
 *   • Silvia Moura Ferreira — 2 contas, nome IDÊNTICO (gmail × Apple relay)
 *   • Eduardo Mange — 3 contas, nome IDÊNTICO
 *   • Nelson Barth — 2 contas com nome idêntico que NÃO são a mesma pessoa (uma é a conta
 *     de TESTE do dono). É "exceção da exceção": não enfraquece a regra, mas exige que o
 *     "não sou eu" seja LEMBRADO.
 *   • Iliane Garcia × Iliane Geraldi Garcia e Andrea Andrea × Andrea Nunes — o dono NÃO
 *     acredita que sejam a mesma pessoa. São o motivo de subconjunto de nome estar PROIBIDO
 *     (_"já apurei 30% de acerto nisso no passado"_).
 *
 * Metade destas asserções existe pra travar o que o motor NÃO pode fazer. Sinal fraco que
 * "quase sempre acerta" vira gerador de dano irreversível quando o próximo passo é apagar
 * uma conta do Auth. */
const D = require('./duplicate-person-core');

let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; } else { fail++; console.error('  ✗ ' + name + (extra ? '  → ' + extra : '')); } }
const achou = (c, p) => D.detectarMesmaPessoa(c, p).suspeito;

// ── 1 · NOME IDÊNTICO dispara (os casos Silvia e Eduardo) ────────────────────
(() => {
  const silviaGmail = { uid: 'u_silvia_gmail', nome: 'Silvia Moura Ferreira' };
  const silviaApple = { uid: 'u_silvia_apple', nome: 'Silvia Moura Ferreira' };
  const s = achou(silviaApple, [silviaGmail, { uid: 'x', nome: 'Outra Pessoa' }]);
  ok('nome idêntico → suspeita', !!s && s.uid === 'u_silvia_gmail');
  ok('  → motivo é "nome"', s && s.motivo === 'nome');

  ok('acento e caixa não atrapalham',
    !!achou({ uid: 'a', nome: 'JOSÉ DA SILVA' }, [{ uid: 'b', nome: 'jose da silva' }]));
  ok('nunca casa consigo mesmo (mesmo uid)',
    !achou({ uid: 'a', nome: 'Fulano' }, [{ uid: 'a', nome: 'Fulano' }]));
})();

// ── 2 · O CASO NELSON: homônimo dispara, mas o "não sou eu" é LEMBRADO ───────
(() => {
  const teste = { uid: 'u_nelson_teste', nome: 'Nelson Barth' };
  const real = { uid: 'u_nelson_real', nome: 'Nelson Barth' };
  ok('homônimo dispara a pergunta (é sinal FORTE, não fraco)', !!achou(teste, [real]));

  const jaDisse = { uid: 'u_nelson_teste', nome: 'Nelson Barth', dispensados: ['u_nelson_real'] };
  ok('depois do "não sou eu", NUNCA mais pergunta', !achou(jaDisse, [real]));
  ok('  → e continua perguntando sobre OUTRA pessoa',
    !!achou(jaDisse, [real, { uid: 'u_terceiro', nome: 'Nelson Barth' }]));
})();

// ── 3 · PROIBIDO: subconjunto de tokens do nome (30% de acerto) ──────────────
(() => {
  ok('Iliane Garcia × Iliane Geraldi Garcia NÃO dispara',
    !achou({ uid: 'a', nome: 'Iliane Garcia' }, [{ uid: 'b', nome: 'Iliane Geraldi Garcia' }]));
  ok('Andrea Andrea × Andrea Nunes NÃO dispara',
    !achou({ uid: 'a', nome: 'Andrea Andrea' }, [{ uid: 'b', nome: 'Andrea Nunes' }]));
  ok('mesmo 1º nome + mesmo último sobrenome NÃO dispara',
    !achou({ uid: 'a', nome: 'Ana Paula Cavalheiro' }, [{ uid: 'b', nome: 'Ana Cavalheiro' }]));
  ok('primeiro nome igual NÃO dispara',
    !achou({ uid: 'a', nome: 'Fernando Cerri' }, [{ uid: 'b', nome: 'Fernando Doria' }]));
})();

// ── 4 · PROIBIDO: nascimento + primeiro nome ("me parece pouco") ─────────────
(() => {
  const c = { uid: 'a', nome: 'Ana Souza', birthDate: '1980-05-10' };
  const p = { uid: 'b', nome: 'Ana Prado', birthDate: '1980-05-10' };
  ok('mesma data de nascimento + mesmo 1º nome NÃO dispara', !achou(c, [p]));
  // Trava a AUSÊNCIA do sinal: se alguém adicionar birthDate ao motor, isto fica vermelho.
  ok('  → o motor sequer olha birthDate',
    D.compararPessoa({ uid: 'a', nome: 'X', birthDate: '1980-05-10' },
      { uid: 'b', nome: 'Y', birthDate: '1980-05-10' }) === null);
})();

// ── 5 · CELULAR: todos os dígitos, nunca sufixo ─────────────────────────────
(() => {
  ok('mesmo número em formatos diferentes → dispara',
    !!achou({ uid: 'a', nome: 'Um Nome', telefone: '+55 (11) 99978-6253' },
      [{ uid: 'b', nome: 'Nome Diferente', telefone: '11999786253' }]));
  ok('  → motivo é "celular" (mais forte que nome)',
    achou({ uid: 'a', nome: 'X', telefone: '+5511999786253' },
      [{ uid: 'b', nome: 'Y', telefone: '+5511999786253' }]).motivo === 'celular');

  // A regra do dono: "considere todos os dígitos e não apenas os 8 últimos".
  ok('números DIFERENTES que compartilham os 8 últimos dígitos NÃO disparam',
    !achou({ uid: 'a', nome: 'X', telefone: '+5511997786253' },
      [{ uid: 'b', nome: 'Y', telefone: '+5521987786253' }]));
  ok('DDD diferente, mesmo final → NÃO dispara',
    !achou({ uid: 'a', nome: 'X', telefone: '+5511999786253' },
      [{ uid: 'b', nome: 'Y', telefone: '+5541999786253' }]));
  ok('telefone vazio dos dois lados não vira coincidência',
    !achou({ uid: 'a', nome: 'X', telefone: '' }, [{ uid: 'b', nome: 'Y', telefone: '' }]));
})();

// ── 6 · letzplay NUNCA sozinho ("desde que o resto coincida") ───────────────
(() => {
  ok('só o handle igual, nome e celular diferentes → NÃO dispara',
    !achou({ uid: 'a', nome: 'Um', letzplayHandle: '@camila' },
      [{ uid: 'b', nome: 'Outro', letzplayHandle: 'camila' }]));

  const s = achou({ uid: 'a', nome: 'Camila Calia', letzplayHandle: '@camilacalia' },
    [{ uid: 'b', nome: 'Camila Calia', letzplayHandle: 'CamilaCalia' }]);
  ok('nome igual + handle igual → dispara e o handle CORROBORA',
    !!s && s.corroboracoes.indexOf('letzplay') !== -1);
})();

// ── 7 · ordem: celular vem antes de nome ────────────────────────────────────
(() => {
  const r = D.detectarMesmaPessoa(
    { uid: 'a', nome: 'Nome Igual', telefone: '+5511911112222' },
    [{ uid: 'so_nome', nome: 'Nome Igual' }, { uid: 'com_tel', nome: 'Zzz', telefone: '11911112222' }]);
  ok('acha os dois', r.todos.length === 2);
  ok('  → o suspeito principal é o do CELULAR (prova prática)', r.suspeito.uid === 'com_tel');
})();

// ── 8 · a pergunta não vaza PII ─────────────────────────────────────────────
(() => {
  const t = D.textoDaPergunta('Gabriela Ferreira', 'ga***@gmail.com', 'nome');
  ok('a pergunta cita o contato MASCARADO', t.indexOf('ga***@gmail.com') !== -1);
  // Ordem do dono: "não é 'você já está inscrito'. É 'você PARECE já estar inscrito com a
  // conta tal'". Afirmar MENTE quando são dois homônimos de verdade (caso Nelson Barth).
  ok('  → NUNCA afirma: diz PARECE', /PARECE/.test(t));
  ok('  → e nomeia a conta', /com a conta/.test(t));
  ok('  → o mesmo vale pro motivo celular',
    /PARECE/.test(D.textoDaPergunta('X', '(••) •••••-••53', 'celular')));
  ok('a pergunta oferece a saída "não sou eu"', /não é você|outra pessoa/i.test(t));
  ok('sem contato, a frase ainda funciona',
    D.textoDaPergunta('X', null, 'nome').indexOf('outra conta') !== -1);
})();

// ── 9 · bordas ──────────────────────────────────────────────────────────────
(() => {
  ok('lista vazia', !achou({ uid: 'a', nome: 'X' }, []));
  ok('pessoa sem uid é ignorada (não dá pra perguntar sobre ninguém)',
    !achou({ uid: 'a', nome: 'X' }, [{ nome: 'X' }]));
  ok('candidato sem nome nem telefone não acusa ninguém',
    !achou({ uid: 'a' }, [{ uid: 'b', nome: 'X', telefone: '11999999999' }]));
  ok('entrada nula não quebra', D.detectarMesmaPessoa(null, null).suspeito === null);
})();


// ── 10 · a FIAÇÃO: o core pode estar certo e nunca ser chamado ───────────────
// Foi assim que o canal de e-mail do sorteio automático ficou sem existir.
(() => {
  const fs = require('fs'); const path = require('path');
  const idx = fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8');
  ok('enrollParticipant roda a detecção', /_detectarDuplicataNoTorneio\(/.test(idx));
  // A PORTA: recusa ANTES de gravar, com o desfecho que TODO cliente já sabe exibir
  // ("Já Inscrito"). Regra do dono: "as pessoas não leem as notificações… nem os emails" —
  // avisar informa quem lê; recusar intercepta todo mundo, na hora, sem depender da loja.
  ok('  → e RECUSA antes de gravar (alreadyEnrolled), não só avisa',
    /RECUSADO por duplicata[\s\S]{0,400}alreadyEnrolled: true/.test(idx));
  ok('  → a detecção roda ANTES da transação (senão já teria gravado)',
    idx.indexOf('_detectarDuplicataNoTorneio(db, _alvoUid0') < idx.indexOf('await db.runTransaction'));
  ok('  → o ORGANIZADOR inscrevendo TERCEIRO passa pela porta (saída sempre existe)',
    /_euMesmo = _alvoUid0 === callerUid/.test(idx) && /if \(_euMesmo\)/.test(idx));
  ok('  → devolve dupSuspect ao cliente novo (o velho já mostra "Já Inscrito")',
    /dupSuspect: \{\s*\/\/[\s\S]{0,200}motivo: _d0\.motivo/.test(idx));
  // O cliente NUNCA recebe o uid da outra conta — só o contato mascarado.
  ok('  → SEM o uid da outra conta (só mascarado)',
    /dupSuspect: \{[\s\S]{0,400}maskedEmail/.test(idx) &&
    !/dupSuspect: \{[\s\S]{0,400}uid: _d0\.uid/.test(idx));
  ok('a detecção NÃO lê o roster inteiro (usa consulta indexada em users)',
    /_detectarDuplicataNoTorneio[\s\S]{0,1500}displayName_lower", "==", nomeLower/.test(idx));
  ok('existe a CF do "não sou eu"', /exports\.dismissDuplicateSuspicion = onCall/.test(idx));
  ok('  → o cliente NÃO passa uid (o servidor redescobre)',
    /dismissDuplicateSuspicion[\s\S]{0,900}_detectarDuplicataNoTorneio\(db, callerUid/.test(idx));
  ok('  → grava nos DOIS perfis (senão a outra conta pergunta o espelho)',
    /dupDismissed: FV\.arrayUnion\(d\.uid\)[\s\S]{0,300}dupDismissed: FV\.arrayUnion\(callerUid\)/.test(idx));


  // ── O SERVIDOR AVISA, porque o cliente NÃO alcança todo mundo ──────────────
  // Regra do dono (06/ago): "esse é o tipo de coisa que deveria rodar em CF e não no
  // cliente". O app NATIVO embarca o JS e não tem auto-update — a pergunta da 1.7.41 só
  // chega numa submissão nova, dias depois. Notificação é DADO: alcança toda versão.
  ok('a CF AVISA a pessoa (não depende da tela nova)', /_avisarDuplicataSuspeita\(db, _alvoUid/.test(idx));
  ok('  → e o aviso sai no MESMO ponto da porta',
    /_avisarDuplicataSuspeita\(db, _alvoUid0[\s\S]{0,400}RECUSADO por duplicata/.test(idx));
  ok('  → usa a MESMA fila de e-mail do app (nunca escrita direta em `mail`)',
    /_avisarDuplicataSuspeita[\s\S]{0,3000}collection\("notif_email_queue"\)/.test(idx));
  ok('  → id determinístico: reinscrever não vira spam',
    /\["dup_suspect", tournamentId, dup\.uid, alvoUid\]/.test(idx));
  ok('  → o aviso leva o contato MASCARADO, nunca o uid da outra conta',
    /_avisarDuplicataSuspeita[\s\S]{0,2200}dup\.maskedEmail \|\| dup\.maskedPhone/.test(idx));
  ok('  → e-mail é opt-out INDEPENDENTE do in-app (quem desligou o sininho quer o e-mail)',
    /_avisarDuplicataSuspeita[\s\S]{0,3000}notifyEmail !== false/.test(idx));

  // O trigger PAROU de renomear em silêncio.
  const bloco = idx.slice(idx.indexOf('exports.enforceUniqueDisplayName'));
  const corpo = bloco.slice(0, bloco.indexOf('\n);'));
  ok('enforceUniqueDisplayName NÃO renomeia mais (sem resolveUniqueName)',
    !/resolveUniqueName\(/.test(corpo));
  ok('  → ele SINALIZA o conflito com contato mascarado', /nameConflict: \{[\s\S]{0,200}maskedEmail/.test(corpo));
  ok('  → e LIMPA o sinal quando o conflito acaba', /nameConflict: admin\.firestore\.FieldValue\.delete\(\)/.test(corpo));
  ok('existe a CF que diz se um nome está livre + sugestões',
    /exports\.checkDisplayNameAvailability = onCall/.test(idx));

  // O cliente também parou de renomear no primeiro login.
  const auth = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'auth.js'), 'utf8');
  ok('o primeiro login NÃO chama mais resolveUniqueDisplayName',
    !/await window\.FirestoreDB\.resolveUniqueDisplayName\(/.test(auth));
  // A PERGUNTA do conflito de nome tem que EXISTIR e ser CHAMADA — o trigger sinaliza em
  // `nameConflict`, e sem consumidor o sinal fica gravado e ninguém lê (foi assim que o
  // canal de e-mail do sorteio automático não existiu).
  ok('existe a tela que PERGUNTA sobre o nome em conflito', /window\._askNameConflict = function/.test(auth));
  ok('  → e ela é DISPARADA depois do login', /_askNameConflict\(\);/.test(auth));
  ok('  → "não sou eu" leva a escolher um nome LIVRE, com sugestões',
    /_pickFreeDisplayName/.test(auth) && /checkDisplayNameAvailability/.test(auth));
  ok('  → "sim, é minha" NÃO funde sozinho: manda pra prova de posse no perfil',
    /_askNameConflict[\s\S]{0,1800}hash = '#profile'/.test(auth));
  // O campo precisa CHEGAR em currentUser — a cópia do perfil é campo a campo, sem merge
  // genérico: sem esta linha a tela nunca dispararia.
  const store = fs.readFileSync(path.join(__dirname, '..', 'js', 'store.js'), 'utf8');
  ok('`nameConflict` é copiado do perfil pra currentUser',
    /currentUser\.nameConflict = profile\.nameConflict/.test(store));

  const enr = fs.readFileSync(path.join(__dirname, '..', 'js', 'views', 'tournaments-enrollment.js'), 'utf8');
  ok('a inscrição pergunta quando o servidor acusa duplicata',
    /result\.dupSuspect\) window\._askDuplicatePerson\(/.test(enr));
  ok('o "não sou eu" chama a CF de dispensa', /dismissDuplicateSuspicion'\)\(\{ tournamentId/.test(enr));
})();

console.log(`\nduplicate-person-core: ${pass} ok, ${fail} falhas`);
process.exit(fail ? 1 : 0);

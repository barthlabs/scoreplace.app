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
 *   • Iliane Garcia × Iliane Geraldi Garcia — em 11/ago/2026 o dono REVISOU: medido, o par
 *     tem o padrão de duplicata real (Apple relay × Google, 0,9 dia, 1 login cada), e
 *     _"parece ser a mesma, mas não dá pra garantir. então o certo é quando entrar perguntar"_.
 *     Sobre "Rodrigo Terra Barth × Rodrigo Barth": _"é diferente. se disser que não é, não é,
 *     mas é um baita indício."_ — ou seja PERGUNTA, e o "não sou eu" é respeitado.
 *     O veto ao subconjunto CRU segue valendo; o que o salva é a guarda de 2+ tokens
 *     (medido: 1 token = 22% de acerto, 2+ = 100%).
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

  // ⚠️ ASSERÇÃO REVISADA (v1.8.3), com o motivo aqui pra não parecer teste afrouxado.
  // Ela dizia "depois do não sou eu, NUNCA mais pergunta" — e o dono mudou essa regra:
  // _"anotar a resposta pra não ficar perguntando de novo SEM DADO NOVO. se coloca o mesmo
  // celular e autentica, daí funde mesmo tendo sido perguntado antes e a pessoa deu que
  // não. as pessoas às vezes não leem na pressa e fecham respondendo não."_
  // O "nunca mais" continua valendo pro MESMO sinal — que é o que importa aqui (o par
  // "Nelson Barth" é homônimo de verdade e não pode virar pergunta recorrente).
  const jaDisse = { uid: 'u_nelson_teste', nome: 'Nelson Barth',
    dispensados: [{ uid: 'u_nelson_real', forca: D.FORCA_SINAL.identico }] };
  ok('depois do "não sou eu", o MESMO sinal nunca mais pergunta', !achou(jaDisse, [real]));
  ok('  → e continua perguntando sobre OUTRA pessoa',
    !!achou(jaDisse, [real, { uid: 'u_terceiro', nome: 'Nelson Barth' }]));
})();

// ── 2b · O "NÃO SOU EU" NÃO É ETERNO: dado novo REABRE (v1.8.3) ─────────────
// Regra do dono (11/ago/2026): _"tem que perguntar. e anotar a resposta pra não ficar
// perguntando de novo sem dado novo. se coloca o mesmo celular e autentica, por exemplo,
// daí funde mesmo tendo sido perguntado antes e a pessoa deu que não. as pessoas às vezes
// não leem na pressa e fecham respondendo não."_
//
// Antes o dispenso guardava só o uid: um toque apressado matava a suspeita PRA SEMPRE,
// inclusive contra evidência muito mais forte depois. Agora guarda a FORÇA do sinal
// dispensado, e só algo ESTRITAMENTE mais forte volta a perguntar.
(() => {
  const eu = { uid: 'a', nome: 'Rodrigo Barth', telefone: '11999998888' };
  const ele = { uid: 'b', nome: 'Rodrigo Barth', telefone: '11999998888' };
  const semTel = (x) => Object.assign({}, x, { telefone: '' });
  const dispNome = [{ uid: 'b', forca: D.FORCA_SINAL.identico }];
  const dispCel = [{ uid: 'b', forca: D.FORCA_SINAL.celular }];

  ok('dispensou o NOME → a MESMA pergunta não volta',
    !achou(Object.assign({}, semTel(eu), { dispensados: dispNome }), [semTel(ele)]));
  const r = achou(Object.assign({}, eu, { dispensados: dispNome }), [ele]);
  ok('  → mas o CELULAR igual REABRE (é dado novo, mais forte)', !!r && r.motivo === 'celular');
  ok('  → e vem marcado como reaberto (o log precisa distinguir)', !!r && r.reaberto === true);
  ok('dispensou o CELULAR → nem o celular nem o nome voltam a perguntar',
    !achou(Object.assign({}, eu, { dispensados: dispCel }), [ele]));

  // Sinal MAIS FRACO nunca reabre — senão a pessoa seria perguntada de novo à toa.
  const dispForte = [{ uid: 'b', forca: D.FORCA_SINAL.identico }];
  ok('subconjunto NÃO reabre um dispenso de nome idêntico',
    !achou({ uid: 'a', nome: 'Iliane Garcia', dispensados: dispForte },
           [{ uid: 'b', nome: 'Iliane Geraldi Garcia' }]));

  // Memória LEGADA (só uid, sem força): reabre UMA vez, porque não se sabe de que sinal
  // era — herdar um "não" cego é pior que perguntar uma vez e voltar a anotar.
  ok('dispenso legado (só uid) reabre uma vez',
    !!achou(Object.assign({}, eu, { dispensados: ['b'] }), [ele]));

  // A força é ORDINAL e o celular tem que estar acima de qualquer sinal de nome —
  // é o que sustenta "o mesmo celular reabre o que o nome dispensou".
  ok('celular é mais forte que qualquer semelhança de nome',
    D.FORCA_SINAL.celular > D.FORCA_SINAL.identico &&
    D.FORCA_SINAL.identico > D.FORCA_SINAL.grafia &&
    D.FORCA_SINAL.grafia > D.FORCA_SINAL.inicial &&
    D.FORCA_SINAL.inicial > D.FORCA_SINAL['1char'] &&
    D.FORCA_SINAL['1char'] > D.FORCA_SINAL.subconjunto);

  // E o servidor tem que GRAVAR a força — sem isso a memória volta a ser cega.
  const idxSrc = require('fs').readFileSync(require('path').join(__dirname, 'index.js'), 'utf8');
  ok('a CF grava dupDismissedInfo COM a força do sinal',
    /dupDismissedInfo: FV\.arrayUnion/.test(idxSrc) && /forcaDoSinal\(d\.motivo, d\.semelhanca\)/.test(idxSrc));
  ok('  → e segue gravando dupDismissed (o app das lojas lê esse, e não tem auto-update)',
    /dupDismissed: FV\.arrayUnion/.test(idxSrc));
  ok('  → e a detecção LÊ a memória rica',
    /dispensados: \[\]\.concat\(/.test(idxSrc) && /dupDismissedInfo/.test(idxSrc));
  // Campo que o servidor consulta pra decidir identidade não pode ser escrito por quem ele avalia.
  const rules = require('fs').readFileSync(
    require('path').join(__dirname, '..', 'firestore.rules'), 'utf8');
  ok('dupDismissedInfo é privilegiado nas firestore.rules',
    /privilegedUserFields[\s\S]{0,300}'dupDismissedInfo'/.test(rules));
})();

// ── 2c · CELULAR AUTENTICADO FUNDE, NEM PERGUNTA (v1.8.3) ──────────────────
// Regra do dono (11/ago/2026): _"no mesmo celular autenticado, já mescla, nem pergunta."_
// (Aqui vale varredura de código: fundir toca Auth + Firestore e o comportamento ponta a
//  ponta não roda em teste puro. O que se trava é a REGRA e os limites dela.)
(() => {
  const idx = require('fs').readFileSync(require('path').join(__dirname, 'index.js'), 'utf8');
  ok('celular OU e-mail iguais disparam FUSÃO em vez de pergunta',
    /r\.suspeito\.motivo === "celular" \|\| r\.suspeito\.motivo === "email"[\s\S]{0,2200}_mergeAccountsKeepOlder\(db, callerUid/.test(idx));
  ok('  → e-mail também exige VERIFICADO no Auth (emailVerified), não o campo do perfil',
    /_meuAuth\.emailVerified && _dupPerson\.normalizarEmail/.test(idx) &&
    /_outroAuth\.emailVerified && _dupPerson\.normalizarEmail/.test(idx));
  // ⚠️ O QUE IMPEDE ISSO DE APAGAR A CONTA DE UM TERCEIRO: a prova é o telefone do AUTH
  // (SMS conferido), NUNCA o campo `phone` do perfil, que é texto digitado — um dígito
  // errado cairia no número de outra pessoa, e fusão apaga do Auth sem volta.
  ok('  → a prova é o telefone do AUTH (getUser().phoneNumber), não o campo do perfil',
    /motivo === "celular"[\s\S]{0,900}admin\.auth\(\)\.getUser\(callerUid\)[\s\S]{0,300}phoneNumber/.test(idx));
  ok('  → e os DOIS lados precisam provar (um só não diz nada sobre o outro)',
    /_p1 && _p2 &&\s*\n?\s*_dupPerson\.normalizarTelefone\(_p1\) === _dupPerson\.normalizarTelefone\(_p2\)/.test(idx) &&
    /_e1 && _e2 && _e1 === _e2/.test(idx));
  ok('  → compara TODOS os dígitos (normalizarTelefone), nunca sufixo',
    !/phoneNumber[\s\S]{0,200}slice\(-\d/.test(idx));
  ok('  → falhar a fusão NÃO barra a inscrição: cai na pergunta',
    /fusão por credencial autenticada falhou[\s\S]{0,140}\}/.test(idx));
  ok('  → depois de fundir não sobra pergunta (retorna null)',
    /fusão automática por credencial autenticada[\s\S]{0,200}return null;/.test(idx));
  // E o e-mail é CREDENCIAL na escala de força — igual ao celular, acima de qualquer nome.
  ok('  → e-mail tem a mesma força do celular (credencial, não indício)',
    D.FORCA_SINAL.email === D.FORCA_SINAL.celular && D.FORCA_SINAL.email > D.FORCA_SINAL.identico);
})();

// ── 2d · A PERGUNTA NO CADASTRO + "SEMPRE AUTENTICADO" (v1.8.3) ─────────────
// Regras do dono (11/ago/2026): _"essa verificação deve acontecer quando a pessoa se
// cadastra"_ · _"tem que perguntar"_ · _"tem que autenticar email ou celular. SEMPRE
// autenticado. nada disso de ser frouxo."_
(() => {
  const idx = require('fs').readFileSync(require('path').join(__dirname, 'index.js'), 'utf8');
  const rules = require('fs').readFileSync(require('path').join(__dirname, '..', 'firestore.rules'), 'utf8');
  const auth = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'views', 'auth.js'), 'utf8');
  const store = require('fs').readFileSync(require('path').join(__dirname, '..', 'js', 'store.js'), 'utf8');

  ok('existe detector de duplicata na BASE (fora de torneio)',
    /async function _detectarDuplicataNaBase\(/.test(idx));
  ok('  → e o trigger do cadastro o chama, gravando dupSuspect',
    /_detectarDuplicataNaBase\(db, uid, a\)[\s\S]{0,400}dupSuspect:/.test(idx));
  ok('  → roda quando NOME, CELULAR ou E-MAIL mudam',
    /_mudouIdent[\s\S]{0,260}a\.phone[\s\S]{0,120}a\.email/.test(idx));
  ok('  → e LIMPA o sinal quando não há mais suspeita (não fica pendurado)',
    /dupSuspect: admin\.firestore\.FieldValue\.delete\(\)/.test(idx));

  // ⚠️ NÃO pode reusar o caminho que BLOQUEIA o cadastro. Delimita o CORPO da função
  // (até o próximo `exports.`) — janela solta alcançaria o trigger que vem depois, que
  // legitimamente usa findDisplayNameConflict pra UNICIDADE.
  const _ini = idx.indexOf('async function _detectarDuplicataNaBase(');
  const _corpo = idx.slice(_ini, idx.indexOf('exports.', _ini));
  ok('a detecção do cadastro NÃO usa findDisplayNameConflict (aquela BLOQUEIA)',
    _ini > 0 && _corpo.indexOf('findDisplayNameConflict') === -1);
  ok('  → e ela é FAIL-OPEN (erro nunca barra cadastro nem inscrição)',
    /_detectarDuplicataNaBase[\s\S]{0,6000}fail-open[\s\S]{0,120}return null/.test(idx));

  // ── "SEMPRE AUTENTICADO" — em TODOS os caminhos que fundem sozinhos ──
  ok('auto-merge por perfil RECUSA sem credencial autenticada nos dois lados',
    /autoMergeOnProfileUpdate[\s\S]{0,4000}RECUSADO[\s\S]{0,200}credencial AUTENTICADA/.test(idx));
  ok('  → e a prova ali é o AUTH (phoneNumber / emailVerified), não o campo do perfil',
    /_autA\.emailVerified/.test(idx) && /_autA && _autA\.phoneNumber/.test(idx));
  ok('  → o detector da BASE também só funde com credencial do AUTH',
    /_detectarDuplicataNaBase[\s\S]{0,6000}a1\.emailVerified/.test(idx));
  // Nenhum caminho pode voltar a fundir por texto digitado.
  ok('nenhuma fusão automática dispara só com o campo do PERFIL',
    !/_executeMerge\(db, keepDoc, dropDoc\)/.test(idx.slice(0, idx.indexOf('RECUSADO'))) ||
    /credencial AUTENTICADA/.test(idx));

  // ── O sinal é PRIVILEGIADO e CHEGA na tela ──
  ok('dupSuspect é privilegiado nas firestore.rules',
    /privilegedUserFields[\s\S]{0,400}'dupSuspect'/.test(rules));
  ok('o cliente PERGUNTA (a função existe e é disparada)',
    /window\._askDuplicateAccount = function/.test(auth) && /_askDuplicateAccount\(\);/.test(auth));
  // A armadilha da 1.7.41: loadUserProfile copia campo a campo — sem plugar, nunca chega.
  ok('  → e dupSuspect é copiado pro currentUser (senão a tela nunca vê)',
    /currentUser\.dupSuspect = profile\.dupSuspect/.test(store));
  ok('  → o texto NUNCA afirma ("PARECE")',
    /_askDuplicateAccount[\s\S]{0,1800}PARECE já ter outra conta/.test(auth));
  ok('  → "não sou eu" vai pro servidor anotar (o cliente não sabe o uid do outro)',
    /dismissDuplicateAccount/.test(auth) && /exports\.dismissDuplicateAccount = onCall/.test(idx));
  ok('  → e o dismiss do cadastro grava a FORÇA do sinal',
    /exports\.dismissDuplicateAccount[\s\S]{0,2200}dupDismissedInfo: FV\.arrayUnion/.test(idx));
})();

// ── 3 · SUBCONJUNTO DE NOME: era proibido, o DONO REVISOU em 11/ago/2026 ─────
// ⚠️ DUAS ASSERÇÕES DESTE BLOCO FORAM INVERTIDAS DE PROPÓSITO, e o motivo fica aqui pra
// não parecer teste afrouxado pra passar. O veto ("30% de acerto") era do sinal CRU e
// continua valendo — o que mudou foi a GUARDA. Ao ver que "Iliane Garcia" e "Iliane
// Geraldi Garcia" são quase certamente a mesma pessoa (Apple relay × Google, 0,9 dia de
// intervalo, um login cada), o dono decidiu: _"parece ser a mesma, mas não dá pra
// garantir. então o certo é quando entrar perguntar se não é a mesma, autenticar e
// mesclar se for o caso."_ Perguntar nunca funde nada — quem autoriza é a prova de posse.
//
// A guarda que salva o sinal (nome MENOR com 2+ tokens) foi medida nos 9 subconjuntos
// reais da base: 1 token = 22% de acerto, 2+ tokens = 100%. Regra do dono:
// _"fabio só sugere se tiver mais um nome parecido. apenas fabio pode ter varios mesmo."_
(() => {
  ok('Iliane Garcia × Iliane Geraldi Garcia DISPARA (subconjunto com 2+ tokens)',
    !!achou({ uid: 'a', nome: 'Iliane Garcia' }, [{ uid: 'b', nome: 'Iliane Geraldi Garcia' }]));
  ok('Ana Cavalheiro × Ana Paula Cavalheiro DISPARA (nome + sobrenome contidos)',
    !!achou({ uid: 'a', nome: 'Ana Paula Cavalheiro' }, [{ uid: 'b', nome: 'Ana Cavalheiro' }]));

  // O EXEMPLO DO PRÓPRIO DONO (11/ago/2026): _"eu mesmo as x coloco rodrigo barth /
  // rodrigo terra barth / rodrigo straub terra barth"_. As três formas são a MESMA pessoa,
  // e é exatamente o que o subconjunto com 2+ tokens tem que reconhecer — inclusive
  // pulando um nome do meio (Barth ⊂ Terra Barth ⊂ Straub Terra Barth).
  const RB = ['Rodrigo Barth', 'Rodrigo Terra Barth', 'Rodrigo Straub Terra Barth'];
  for (let i = 0; i < RB.length; i++) {
    for (let j = i + 1; j < RB.length; j++) {
      ok('  → ' + JSON.stringify(RB[i]) + ' × ' + JSON.stringify(RB[j]) + ' dispara',
        !!achou({ uid: 'a', nome: RB[i] }, [{ uid: 'b', nome: RB[j] }]));
    }
  }

  // Mesma família, mesmo padrão: "nelson barth" / "nelson terra barth" (dono, 11/ago).
  ok('  → "Nelson Barth" × "Nelson Terra Barth" dispara',
    !!achou({ uid: 'a', nome: 'Nelson Barth' }, [{ uid: 'b', nome: 'Nelson Terra Barth' }]));
  // ⚠️ E o par que NÃO pode virar fusão automática por causa disso: as duas contas
  // "Nelson Barth" homônimas (uma é a de TESTE do dono) seguem sendo PERGUNTA, e o
  // "não sou eu" (dupDismissed) é que as separa — não o enfraquecimento da regra.

  // O QUE CONTINUA FORA — é isto que impede a volta dos 30%:
  ok('“Fabio” sozinho NÃO dispara contra “Fabio Rey” (1 token não identifica ninguém)',
    !achou({ uid: 'a', nome: 'Fabio' }, [{ uid: 'b', nome: 'Fabio Rey' }]));
  ok('  → nem contra “Fábio Simão” (o mesmo “Fabio” casaria com 3 pessoas reais da base)',
    !achou({ uid: 'a', nome: 'Fabio' }, [{ uid: 'b', nome: 'Fábio Simão' }]));
  ok('  → nem “Marco” contra “Adriana de Marco”',
    !achou({ uid: 'a', nome: 'Marco' }, [{ uid: 'b', nome: 'Adriana de Marco' }]));
  ok('Andrea Andrea × Andrea Nunes NÃO dispara (sobrenome diferente, não é subconjunto)',
    !achou({ uid: 'a', nome: 'Andrea Andrea' }, [{ uid: 'b', nome: 'Andrea Nunes' }]));
  ok('primeiro nome igual e sobrenome diferente NÃO dispara',
    !achou({ uid: 'a', nome: 'Fernando Cerri' }, [{ uid: 'b', nome: 'Fernando Doria' }]));
  ok('  → Denise Soares × Denise Mamesso NÃO dispara (caso real da base)',
    !achou({ uid: 'a', nome: 'Denise Soares' }, [{ uid: 'b', nome: 'Denise Mamesso' }]));
})();

// ── 3b · O INCIDENTE DO CONFRA (11/ago/2026), caso a caso ────────────────────
// Duas pessoas com DUAS contas cada, jogando em grupos diferentes da MESMA rodada.
// Nenhuma foi detectada. Estas asserções são o incidente virado teste.
(() => {
  ok('M.Delia Fernandez × MDelia Fernandez dispara (o ponto virava espaço)',
    !!achou({ uid: 'a', nome: 'M.Delia Fernandez' }, [{ uid: 'b', nome: 'MDelia Fernandez' }]));
  ok('Debora Castello × Dėbora Castello dispara (ė = U+0117)',
    !!achou({ uid: 'a', nome: 'Debora Castello' }, [{ uid: 'b', nome: 'Dėbora Castello' }]));
  ok('M.Delia Fernandez × Delia Fernandez dispara (inicial OMITIDA — regra do dono)',
    !!achou({ uid: 'a', nome: 'M.Delia Fernandez' }, [{ uid: 'b', nome: 'Delia Fernandez' }]));
  ok('M.Delia Fernandez × Maria Delia Fernandez dispara (inicial EXPANDIDA, m=maria)',
    !!achou({ uid: 'a', nome: 'M.Delia Fernandez' }, [{ uid: 'b', nome: 'Maria Delia Fernandez' }]));
  ok('as outras grafias do separador também: M_Delia, M-Delia, M Delia',
    !!achou({ uid: 'a', nome: 'M_Delia Fernandez' }, [{ uid: 'b', nome: 'M-Delia Fernandez' }]) &&
    !!achou({ uid: 'a', nome: 'MDelia Fernandez' }, [{ uid: 'b', nome: 'M Delia Fernandez' }]));
  ok('Castello × Castelo dispara (consoante dobrada — 1 caractere)',
    !!achou({ uid: 'a', nome: 'Debora Castello' }, [{ uid: 'b', nome: 'Debora Castelo' }]));
  ok('Mariana C × Mariana Ciocci dispara (caso real que passou batido em ago/2026)',
    !!achou({ uid: 'a', nome: 'Mariana C' }, [{ uid: 'b', nome: 'Mariana Ciocci' }]));
  ok('Marcos Alvarez × Marcos a Alvarez dispara (inicial no MEIO)',
    !!achou({ uid: 'a', nome: 'Marcos Alvarez' }, [{ uid: 'b', nome: 'Marcos a Alvarez' }]));

  // ⚠️ BUSCA E COMPARAÇÃO TÊM QUE ENXERGAR O MESMO. Era a divergência entre as duas que
  // deixava o caso da Debora passar: a comparação resolvia, a consulta não entregava o
  // candidato. Se as chaves pararem de cobrir um caso que compararNomes aceita, aqui fica
  // vermelho — que é o único jeito de a regressão não voltar em silêncio.
  const C = require('./duplicate-person-core.js');
  const cruzam = (a, b) => {
    const ka = C.chavesDeBusca(a), kb = C.chavesDeBusca(b);
    if (ka.some((k) => kb.indexOf(k) !== -1)) return true;
    if (C.chaveSobrenome(a) && C.chaveSobrenome(a) === C.chaveSobrenome(b)) return true;
    // rede do nome abreviado: só vale quando algum lado tem inicial (é o que o index.js faz)
    if (C.temInicialAbreviada(a) || C.temInicialAbreviada(b)) {
      return !!C.chavePrimeiroNome(a) && C.chavePrimeiroNome(a) === C.chavePrimeiroNome(b);
    }
    return false;
  };
  [['M.Delia Fernandez', 'MDelia Fernandez'], ['Debora Castello', 'Dėbora Castello'],
   ['M.Delia Fernandez', 'Delia Fernandez'], ['M.Delia Fernandez', 'Maria Delia Fernandez'],
   ['Debora Castello', 'Debora Castelo'], ['Mariana C', 'Mariana Ciocci'],
   ['Marcos Alvarez', 'Marcos a Alvarez'], ['Iliane Garcia', 'Iliane Geraldi Garcia'],
  ].forEach(([a, b]) => {
    ok('  → a BUSCA alcança o par ' + JSON.stringify(a) + ' × ' + JSON.stringify(b), cruzam(a, b));
  });
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
  // ⚠️ ASSERÇÃO REVISADA (v1.8.3), com o motivo aqui pra não parecer afrouxamento.
  // Ela ancorava no texto literal `displayName_lower", "==", nomeLower` dentro de uma
  // janela de 1500 chars. A janela quebrou quando a busca ganhou as chaves novas
  // (displayName_keys / displayName_lastkey) e o comentário que explica o incidente.
  // O INVARIANTE que ela defende — "a detecção não varre o roster lendo perfil por
  // perfil; ela usa consulta INDEXADA em users" — continua valendo e ficou mais forte.
  // Agora é isso que se trava, sem depender de qual campo é consultado.
  ok('a detecção usa consulta INDEXADA em users (não lê o roster inteiro)',
    /_detectarDuplicataNoTorneio[\s\S]{0,4000}db\.collection\("users"\)[\s\S]{0,200}\.where\(/.test(idx));
  ok('  → e NUNCA busca perfil por uid iterando memberUids',
    !/_detectarDuplicataNoTorneio[\s\S]{0,4000}memberUids[\s\S]{0,300}\.doc\([\s\S]{0,40}\)\.get\(\)/.test(idx));
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

'use strict';
/*
 * duplicate-person-core.js — "esta pessoa já não está inscrita com outra conta?"
 *
 * POR QUE EXISTE: a mesma pessoa cria uma segunda conta (quase sempre entrando com Apple
 * depois de ter entrado com Google, ou vice-versa) e se inscreve DE NOVO no mesmo torneio.
 * Aconteceu com nome idêntico ("Gabriela Ferreira") e com nome parecido ("Fernando Cerri").
 * Com a corrida por vaga na lista de espera, uma duplicata rouba o lugar de outra pessoa.
 *
 * O QUE ISTO FAZ E O QUE NÃO FAZ: aqui só se DETECTA e se PERGUNTA. Nada funde, nada bloqueia.
 * Quem autoriza a fusão é a prova de posse (link no e-mail / SMS no celular da outra conta) —
 * ver [[project_unique_display_name]]. O erro é assimétrico: inscrição duplicada é incômodo
 * reversível; fundir duas pessoas apaga uma do Auth e não tem volta.
 *
 * ═══ OS SINAIS, definidos pelo dono (05/ago/2026) ═══
 *   1. CELULAR igual  → dispara. **TODOS os dígitos**, nunca "os N últimos": ordem explícita
 *      dele. Sufixo de 8 dígitos casa números diferentes de DDDs diferentes.
 *   2. NOME normalizado idêntico → dispara. Homônimo é sinal FORTE: trate como a mesma pessoa
 *      e PERGUNTE. (A exceção do dono — duas contas "Nelson Barth", uma delas de teste — é
 *      "exceção da exceção" e é coberta pelo `dispensados`, não por enfraquecer a regra.)
 *   3. letzplayHandle igual → **NUNCA sozinho**: _"ok desde que o resto coincida e autentique"_.
 *      Só corrobora um dos dois acima.
 *
 * ═══ O NOME DEIXOU DE SER "IGUAL OU NADA" (11/ago/2026) ═══
 * Incidente do Confra: DUAS pessoas ficaram com DUAS contas cada, jogando em grupos
 * diferentes da MESMA rodada, e a detecção não viu nenhuma. Reação do dono: _"é a porcaria
 * do nosso sistema de mesclagem não funcionando direito e permitindo que a pessoa se
 * inscreva com duas contas diferentes num mesmo torneio."_ O nome agora casa por
 * `compararNomes`, que responde: identico · grafia · inicial · 1char · subconjunto.
 *
 * ═══ SUBCONJUNTO: proibido antes, LIBERADO COM GUARDA pelo dono ═══
 *   O veto era _"é um pulo para problema… já apurei 30% de acerto"_ — e continua valendo
 *   pro sinal CRU. Ele mesmo revisou ao ver que "Iliane Garcia" e "Iliane Geraldi Garcia"
 *   provavelmente são a mesma pessoa: _"parece ser a mesma, mas não dá pra garantir. então
 *   o certo é quando entrar perguntar se não é a mesma, autenticar e mesclar se for o caso."_
 *   A guarda (menor com 2+ tokens) foi MEDIDA na base: 1 token = 22% de acerto, 2+ = 100%.
 *   Ver subconjuntoDeNome.
 *
 * ═══ AINDA PROIBIDO ═══
 *   • Mesma data de nascimento + mesmo primeiro nome: _"me parece pouco"_.
 *   Há teste travando isso fora do motor — não é "ainda não implementado".
 *
 * REGRA: PURO — nada de firebase/admin. Decide; quem lê o banco e pergunta é o index.js.
 */

/** Nome comparável: sem acento, sem caixa, sem pontuação, espaço colapsado. */
function normalizarNome(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * CHAVE COLAPSADA — a mesma sequência de letras, seja qual for a grafia.
 * "M.Delia Fernandez" / "MDelia Fernandez" / "M_Delia" / "M-Delia" / "M Delia" → mdeliafernandez
 * "Debora Castello"   / "Dėbora Castello"                                      → deboracastello
 *
 * POR QUE ELA EXISTE (incidente do Confra, 11/ago/2026): duas pessoas ficaram com DUAS contas
 * cada, jogando em grupos diferentes da MESMA rodada, e a detecção não viu nenhuma das duas.
 *   • `M.Delia` × `MDelia`  — `normalizarNome` transforma o ponto em ESPAÇO, e "m delia" nunca
 *     casa com "mdelia". Colapsar os separadores resolve.
 *   • `Debora` × `Dėbora`   — o `ė` é U+0117; `normalizarNome` JÁ o resolvia. O furo era outro,
 *     e pior: a CONSULTA que traz os candidatos usava `displayName_lower` (toLowerCase cru,
 *     que preserva o diacrítico), então o candidato nunca chegava e a comparação boa nunca
 *     rodava. Havia normalização FORTE pra comparar e FRACA pra buscar — e a fraca decide.
 * Por isso esta chave é DENORMALIZADA no perfil (`displayName_key`) e é ela que se consulta:
 * a regra que compara e a que busca passaram a ser a MESMA. Ver
 * [[project_duplicate_detection_two_normalizations]].
 */
function chaveNome(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Último token do nome (sobrenome), colapsado. Índice secundário da busca.
 * Usa os tokens SEM iniciais: em "Mariana C" o último token é a inicial "c", que não
 * identifica nada — o sobrenome útil ali é o que sobra ("mariana").
 */
function chaveSobrenome(s) {
  const t = tokensSemIniciais(s);
  return t.length ? t[t.length - 1].replace(/[^a-z0-9]/g, '') : '';
}

/**
 * Primeiro token do nome. Índice usado SÓ quando um dos lados tem inicial abreviada.
 *
 * POR QUE existe: "Mariana C" × "Mariana Ciocci" é a mesma pessoa (caso real, ago/2026) e
 * `compararNomes` reconhece — mas nenhuma chave cruzava, porque o sobrenome de um lado é
 * uma letra. Sem esta rede, a comparação aceitaria um candidato que a busca nunca entrega,
 * que é exatamente a divergência busca×comparação que produziu o incidente do Confra.
 *
 * ⚠️ Consultar por primeiro nome é AMPLO (traz todas as "Mariana"), por isso o index.js só
 * dispara essa consulta quando o nome do candidato realmente tem inicial abreviada.
 */
function chavePrimeiroNome(s) {
  const t = tokensNome(s);
  return t.length ? t[0].replace(/[^a-z0-9]/g, '') : '';
}

/** O nome traz alguma inicial abreviada ("M.Delia", "Mariana C", "Marcos a Alvarez")? */
function temInicialAbreviada(s) {
  return tokensNome(s).some((x) => x.length === 1);
}

/**
 * Distância de edição com CORTE em `teto` — devolve `teto+1` assim que passa, sem terminar
 * a matriz. Só se usa com teto 1, então é O(n) na prática.
 */
function distanciaNome(a, b, teto) {
  const lim = (teto == null) ? 1 : teto;
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > lim) return lim + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let min = i;
    for (let j = 1; j <= b.length; j++) {
      const c = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur[j] = c;
      if (c < min) min = c;
    }
    if (min > lim) return lim + 1;
    prev = cur;
  }
  return prev[b.length];
}

/** Nome longo o bastante pra tolerar 1 caractere de diferença sem virar ruído. */
const MIN_LEN_1CHAR = 10;
/** Só nome bem longo tolera DUAS trocas — e só no rigor de torneio. */
const MIN_LEN_2CHAR = 12;

/** Tokens do nome (já sem acento/pontuação/caixa). */
function tokensNome(s) {
  return normalizarNome(s).split(' ').filter(Boolean);
}

/**
 * INICIAL É OMISSÍVEL. Regra do dono (11/ago/2026), olhando "M.Delia Fernandez":
 * _"fica claro ser um nome composto que a pessoa quer omitir (m=maria). nesse caso a
 * delia fernandez tambem deveria sugerir ser a mesma."_
 *
 * Um token de UMA letra é uma inicial: quem escreve "M.Delia Fernandez" hoje escreve
 * "Delia Fernandez" amanhã e "Maria Delia Fernandez" no cadastro do clube. Então o nome
 * gera uma segunda forma, SEM as iniciais, e ela também entra na comparação e no índice.
 *
 * ⚠️ Só tokens de 1 letra saem. Nome do meio INTEIRO ("Geraldi") nunca é descartado — é
 * justamente essa diferença que separa "grafia diferente do mesmo nome" de "nome
 * incompleto", o sinal de 30% de acerto que o dono vetou.
 */
function tokensSemIniciais(s) {
  const t = tokensNome(s).filter((x) => x.length > 1);
  return t.length ? t : tokensNome(s);   // nome só de iniciais: não sobra nada pra comparar
}

/**
 * Dois tokens compatíveis: iguais, ou um é a INICIAL do outro ("m" ↔ "maria").
 * É o que faz "M.Delia Fernandez" casar com "Maria Delia Fernandez".
 */
function tokenCompativel(a, b) {
  if (a === b) return true;
  if (a.length === 1) return b.startsWith(a);
  if (b.length === 1) return a.startsWith(b);
  return false;
}

/**
 * AS CHAVES QUE VÃO PRO ÍNDICE (`displayName_keys`, array no perfil).
 *
 * Aqui mora a lição do incidente: **quem BUSCA tem que enxergar o mesmo que quem COMPARA**.
 * Antes a consulta era `displayName_lower ==` (toLowerCase cru) e a comparação era forte —
 * a forte nunca rodava porque a fraca não entregava o candidato. Agora a busca é
 * `array-contains-any` sobre estas chaves, geradas pela MESMA lógica da comparação.
 *
 * Três formas por nome (deduplicadas):
 *   1. colapsada            "M.Delia Fernandez" → mdeliafernandez
 *   2. sem iniciais         "M.Delia Fernandez" → deliafernandez
 *   3. sem letra dobrada    "Debora Castello"   → deboracastelo   (casa "Castelo")
 *
 * A (3) cobre a consoante dobrada, que é o erro de grafia mais comum em nome
 * português/italiano (Castello/Castelo, Barretto/Barreto, Anna/Ana) e que nenhuma
 * normalização de acento pega.
 *
 * A rede complementar é `chaveSobrenome` (índice à parte): traz quem tem o MESMO sobrenome
 * e deixa `compararNomes` decidir — é por ela que "MDelia Fernandez" alcança
 * "Delia Fernandez", cujas chaves não se cruzam.
 */
function chavesDeBusca(s) {
  const base = chaveNome(s);
  if (!base) return [];
  const semIni = tokensSemIniciais(s).join('');
  const semDobra = base.replace(/(.)\1+/g, '$1');
  const out = [];
  [base, semIni, semDobra].forEach((k) => { if (k && out.indexOf(k) === -1) out.push(k); });
  return out;
}

/**
 * "Estes dois nomes são a MESMA pessoa escrita de outro jeito?"
 * @returns {'identico'|'grafia'|'inicial'|'1char'|null}
 *
 * QUATRO respostas, em ordem de força:
 *   • `identico` — iguais tirando acento/caixa/pontuação (o único sinal que existia antes).
 *   • `grafia`   — mesma sequência de letras, separadores ou diacrítico diferentes:
 *                  "M.Delia" × "MDelia" × "M_Delia" × "M-Delia"; "Debora" × "Dėbora".
 *   • `inicial`  — bate quando as iniciais são omitidas ou expandidas:
 *                  "M.Delia Fernandez" × "Delia Fernandez" × "Maria Delia Fernandez".
 *   • `1char`    — UM caractere de diferença ("Castello" × "Castelo", "MDelia" × "Delia").
 *
 * ⚠️ O QUE TRAVA O PROIBIDO: o número de tokens **de 2+ letras** tem que ser IGUAL.
 * "Iliane Garcia" (2) ⊄ "Iliane Geraldi Garcia" (3) → null antes de qualquer distância.
 * Sem essa guarda a tolerância não distinguiria "escrito diferente" de "incompleto", que é
 * exatamente o subconjunto de nome reprovado pelo dono. Ver
 * [[feedback_duplicate_person_signals]]. Há teste travando cada caso vetado.
 *
 * ⚠️ MEDIDO nos 199 nomes reais da base (11/ago/2026): a regra inteira produz 3 pares, e os
 * 3 são duplicatas de verdade (as duas do Confra + o par "Nelson Barth", já conhecido).
 * ZERO falso positivo. O risco teórico que sobra é "Paulo Silva × Paula Silva" — não existe
 * na base, e o custo seria uma PERGUNTA que o "não sou eu" desliga pra sempre
 * (`dupDismissed`). Nada aqui funde nem bloqueia: detecta e pergunta.
 */
function compararNomes(a, b, opts) {
  // ── RIGOR POR CONTEXTO (11/ago/2026, regra do dono) ─────────────────────────
  // _"quando a pessoa se inscreve de novo no mesmo torneio aumenta a chance de ser a
  // mesma pessoa. a busca deve ser mais dura aqui."_ E está certo: no cadastro o universo
  // é a base inteira (200+ contas e crescendo) e quem se parece com você provavelmente não
  // tem nada a ver; dentro de UM torneio o universo é ~130 pessoas que já demonstraram
  // intenção naquele evento, então a mesma semelhança vale muito mais.
  //
  // ⚠️ MAS "mais duro" foi MEDIDO nos 131 inscritos do Confra, não afrouxado no olho.
  // O que passou (0 falso positivo cada):
  //   • sem piso de comprimento pro 1char  → "Ana Lima" × "Ana Lino" passa a valer aqui
  //   • distância 2 em nome longo (12+)    → duas trocas de letra no nome inteiro
  // O que foi MEDIDO E REPROVADO, e por isso NÃO está aqui:
  //   • "1º nome + INICIAL do sobrenome"  → 7 pares, 7 ERRADOS. Recria exatamente
  //     "Roberta Lukaisus × Roberta Lima", que o dono já vetara, mais "Ana cattani ×
  //     Ana Carolina Cilone", "Eliane Cappellini × Eliane Cinelli". Sobrenome diferente
  //     com a mesma letra inicial é comum demais: 131 pessoas já colidem 7 vezes.
  //   • subconjunto com 1 token           → 4 pares errados ("Fabio" × "Fábio Simão",
  //     "Marco" × "Adriana de Marco"). O contexto não salva um token só.
  // As outras duas coisas que o dono pediu — "nome e sobrenome" e "sobrenome com letras
  // dobradas nos 2" — já valiam antes disso (subconjunto e 1char): medidas, 0 pares novos.
  const torneio = !!(opts && opts.rigor === 'torneio');

  const na = normalizarNome(a);
  const nb = normalizarNome(b);
  if (!na || !nb) return null;
  if (na === nb) return 'identico';

  if (chaveNome(a) && chaveNome(a) === chaveNome(b)) return 'grafia';

  const ta = tokensNome(a);
  const tb = tokensNome(b);
  // Alinhamento com expansão de inicial: "m delia fernandez" ↔ "maria delia fernandez".
  if (ta.length === tb.length && ta.every((x, i) => tokenCompativel(x, tb[i]))) return 'inicial';

  // Daqui pra baixo, compara as formas SEM iniciais — é o que casa "M.Delia Fernandez"
  // com "Delia Fernandez". A guarda anti-subconjunto vale sobre ESSAS listas.
  const sa = tokensSemIniciais(a);
  const sb = tokensSemIniciais(b);
  // Nome INCOMPLETO é testado aqui, antes do guard de "mesmo número de tokens" — é
  // justamente a diferença de tamanho que o caracteriza. A guarda dele é outra (2+ tokens
  // no menor); ver subconjuntoDeNome.
  if (sa.length !== sb.length) return subconjuntoDeNome(sa, sb) ? 'subconjunto' : null;
  const ksa = sa.join('');
  const ksb = sb.join('');
  if (!ksa || !ksb) return null;
  if (ksa === ksb) return 'inicial';
  if (sa.every((x, i) => tokenCompativel(x, sb[i]))) return 'inicial';

  // No torneio o piso de comprimento cai (medido: 0 falso positivo em 131 inscritos).
  if (!torneio && Math.min(ksa.length, ksb.length) < MIN_LEN_1CHAR) return null;
  if (distanciaNome(ksa, ksb, 1) <= 1) return '1char';

  // Só no torneio: DUAS trocas de letra, e apenas em nome longo — em nome curto duas
  // edições já viram outra pessoa.
  if (torneio && Math.min(ksa.length, ksb.length) >= MIN_LEN_2CHAR &&
      distanciaNome(ksa, ksb, 2) <= 2) return '2char';
  return null;
}

/** Quantos tokens o nome MENOR precisa ter pra um subconjunto valer alguma coisa. */
const MIN_TOKENS_SUBCONJUNTO = 2;

/**
 * NOME INCOMPLETO — "Iliane Garcia" ⊂ "Iliane Geraldi Garcia".
 *
 * ⚠️ ISTO JÁ FOI PROIBIDO E FOI O DONO QUEM REVISOU (11/ago/2026). O veto original era
 * _"é um pulo para problema… já apurei 30% de acerto nisso no passado"_ — e continua
 * valendo pro sinal CRU. A revisão veio ao ver que "Iliane Garcia" e "Iliane Geraldi
 * Garcia" provavelmente SÃO a mesma pessoa (Apple relay × Google, criadas com 0,9 dia de
 * intervalo, um único login cada): _"isso parece ser a mesma, mas não dá pra garantir.
 * então o certo é quando entrar perguntar se não é a mesma, autenticar e mesclar se for
 * o caso."_ Perguntar é seguro — quem autoriza a fusão é a prova de posse, nunca o nome.
 *
 * ⚠️ A GUARDA É O QUE SALVA O SINAL, e ela foi MEDIDA nos 9 subconjuntos reais da base:
 *   • menor com 1 token  → 9 pares, 2 certos, 7 errados = **22%** (os 30% do dono).
 *     "Fabio" é subconjunto de TRÊS pessoas distintas (Fabio Rey, Fábio Ruggiero,
 *     Fábio Simão), e "Marco" ⊂ "Adriana de Marco".
 *   • menor com 2+ tokens → 2 pares, 2 certos, 0 errados = **100%**.
 * Um token só é um primeiro nome solto: não identifica ninguém. Dois já carregam
 * sobrenome. Por isso o piso é 2 — não é número escolhido no olho.
 */
function subconjuntoDeNome(ta, tb) {
  const menor = ta.length < tb.length ? ta : tb;
  const maior = ta.length < tb.length ? tb : ta;
  if (menor.length === maior.length) return false;
  if (menor.length < MIN_TOKENS_SUBCONJUNTO) return false;
  return menor.every((x) => maior.indexOf(x) !== -1);
}

/**
 * Telefone comparável. Compara o número INTEIRO — nunca um sufixo.
 *
 * O único ajuste é o código do país: o app grava E.164 (`+5511...`), mas doc antigo pode ter
 * o número local (`11...`). Prefixar o 55 quando falta é CANONIZAR, não truncar — continua-se
 * comparando todos os dígitos significativos. Sem isso, a mesma pessoa com o número gravado
 * nos dois formatos não casaria, que é o oposto do que se quer.
 */
function normalizarTelefone(s) {
  const d = String(s == null ? '' : s).replace(/\D/g, '');
  if (!d) return '';
  if (d.length >= 12 && d.slice(0, 2) === '55') return d;   // já tem DDI
  if (d.length === 10 || d.length === 11) return '55' + d;   // BR sem DDI
  return d;
}

/**
 * E-mail comparável. É CREDENCIAL, igual ao celular — regra do dono (11/ago/2026):
 * _"só seria o mesmo rodrigo no exemplo se for o mesmo celular ou email. aí é e nem precisa
 * perguntar, autenticou já mescla."_ Sintético de conta phone-only não conta: não é
 * endereço de ninguém.
 */
function normalizarEmail(s) {
  const e = String(s == null ? '' : s).trim().toLowerCase();
  if (!e || e.indexOf('@') < 0) return '';
  if (/@phone\.scoreplace\.app$/.test(e)) return '';
  return e;
}

/** Handle do letzplay comparável (sem @, sem caixa). */
function normalizarHandle(s) {
  return String(s == null ? '' : s).trim().replace(/^@+/, '').toLowerCase();
}

/**
 * Compara o candidato com UMA pessoa já inscrita.
 * @returns {{motivo:string, corroboracoes:string[]}|null}
 */
function compararPessoa(candidato, pessoa, opts) {
  if (!candidato || !pessoa) return null;
  if (!pessoa.uid || !candidato.uid) return null;
  if (pessoa.uid === candidato.uid) return null;             // é ela mesma

  const telA = normalizarTelefone(candidato.telefone);
  const telB = normalizarTelefone(pessoa.telefone);
  // E-mails de cada lado: o principal + os VINCULADOS (linkedEmails), que são os endereços
  // que a pessoa já provou possuir em fusões anteriores.
  const mailsDe = (p) => [].concat(p.email || [], p.linkedEmails || [])
    .map(normalizarEmail).filter(Boolean);
  const mailsA = mailsDe(candidato), mailsB = mailsDe(pessoa);
  const mesmoEmail = mailsA.some((x) => mailsB.indexOf(x) !== -1);
  const lzA = normalizarHandle(candidato.letzplayHandle);
  const lzB = normalizarHandle(pessoa.letzplayHandle);

  const mesmoTel = !!(telA && telB && telA === telB);
  // v1.8.3 — não é mais igualdade exata: grafia, inicial omitida e 1 caractere também
  // contam. Ver compararNomes e [[project_duplicate_detection_two_normalizations]].
  const parecidoNome = compararNomes(candidato.nome, pessoa.nome, opts);
  const mesmoLz = !!(lzA && lzB && lzA === lzB);

  // letzplay NÃO dispara sozinho — só reforça. Regra do dono.
  if (!mesmoTel && !mesmoEmail && !parecidoNome) return null;

  const corroboracoes = [];
  if ((mesmoTel || mesmoEmail) && parecidoNome) corroboracoes.push('nome');
  if (mesmoLz) corroboracoes.push('letzplay');

  return {
    // Celular e e-mail são CREDENCIAIS (o Auth não deixa dois uids com a mesma); nome é
    // indício. Por isso os dois vêm antes na ordem — e ambos, autenticados, fundem sem
    // perguntar (ver index.js).
    motivo: mesmoTel ? 'celular' : (mesmoEmail ? 'email' : 'nome'),
    // Como os nomes se parecem — o index.js usa isto no log e o texto da pergunta muda
    // quando a grafia é diferente (afirmar "o mesmo nome" seria falso ali).
    semelhanca: parecidoNome || null,
    corroboracoes,
  };
}

/**
 * FORÇA DO SINAL — o quanto ele sustenta "é a mesma pessoa".
 *
 * POR QUE ISTO EXISTE (regra do dono, 11/ago/2026): _"tem que perguntar. e anotar a
 * resposta pra não ficar perguntando de novo sem dado novo. se coloca o mesmo celular e
 * autentica, por exemplo, daí funde mesmo tendo sido perguntado antes e a pessoa deu que
 * não. as pessoas às vezes não leem na pressa e fecham respondendo não."_
 *
 * O "não sou eu" era ABSOLUTO: guardava só o uid do outro, então bastava um toque
 * apressado pra a suspeita morrer PRA SEMPRE — inclusive contra evidência muito mais
 * forte que aparecesse depois. Agora o dispensado guarda TAMBÉM a força do sinal que foi
 * dispensado, e a pergunta só volta quando surge algo ESTRITAMENTE mais forte. Ou seja:
 * não repete a mesma pergunta (que é o que irrita), mas dado novo reabre.
 *
 * A escala é ordinal, não uma nota: só serve pra comparar "mais forte que". Celular fica
 * muito acima do nome porque é credencial (o Auth não deixa dois uids com o mesmo número),
 * enquanto nome parecido é indício.
 */
const FORCA_SINAL = {
  subconjunto: 1,   // nome incompleto — o mais fraco que dispara
  '2char': 2,       // duas letras de diferença (só no rigor de torneio)
  '1char': 3,
  inicial: 4,
  grafia: 5,
  identico: 6,
  celular: 9,       // credencial, não indício
  email: 9,         // idem — mesma força
};

/** Força do que foi detectado. `motivo` é 'celular'|'nome'; `semelhanca` detalha o nome. */
function forcaDoSinal(motivo, semelhanca) {
  if (motivo === 'celular' || motivo === 'email') return FORCA_SINAL[motivo];
  return FORCA_SINAL[semelhanca] || 0;
}

/**
 * Normaliza a memória do "não sou eu". Aceita as DUAS formas:
 *   • legado: ['uidA', 'uidB']                → força 0 (qualquer sinal reabre)
 *   • atual:  [{ uid, forca }]                 → só reabre com sinal mais forte
 * O legado ficar com força 0 é DELIBERADO: aqueles dispensos foram dados sem registrar o
 * motivo, então não dá pra afirmar que cobriam o sinal de hoje. Reabrir uma vez e voltar a
 * anotar é melhor que herdar um "não" que ninguém sabe do que era.
 */
function mapaDeDispensados(lista) {
  const out = {};
  (Array.isArray(lista) ? lista : []).forEach((d) => {
    if (!d) return;
    if (typeof d === 'string') { out[d] = Math.max(out[d] || 0, 0); return; }
    if (d.uid) out[d.uid] = Math.max(out[d.uid] || 0, Number(d.forca) || 0);
  });
  return out;
}

/**
 * Procura, entre as pessoas já inscritas, alguém que pareça ser o candidato.
 *
 * @param candidato  { uid, nome, telefone, letzplayHandle, dispensados: [uid] }
 * @param pessoas    [{ uid, nome, telefone, letzplayHandle, email }]
 * @returns { suspeito: {uid,motivo,corroboracoes}|null, todos: [...] }
 *
 * `dispensados` é a memória do "não sou eu" — sem ela a pessoa (e a conta de TESTE do dono)
 * receberia a mesma pergunta em todo torneio novo, pra sempre.
 */
function detectarMesmaPessoa(candidato, pessoas, opts) {
  const dispensados = mapaDeDispensados(candidato && candidato.dispensados);

  const todos = [];
  for (const p of (Array.isArray(pessoas) ? pessoas : [])) {
    if (!p) continue;
    const r = compararPessoa(candidato, p, opts);
    if (!r) continue;
    // ⚠️ O "NÃO SOU EU" NÃO É ETERNO — ele cobre o sinal que foi dispensado, não todos.
    // Se o que se vê AGORA é mais forte do que o que a pessoa recusou, a pergunta volta:
    // ela pode ter fechado no automático ("as pessoas às vezes não leem na pressa"), e
    // dado novo merece pergunta nova. Igual ou mais fraco fica calado — é o que impede a
    // mesma pergunta de voltar toda vez.
    const forca = forcaDoSinal(r.motivo, r.semelhanca);
    if (Object.prototype.hasOwnProperty.call(dispensados, p.uid) && forca <= dispensados[p.uid]) continue;
    todos.push({ uid: p.uid, motivo: r.motivo, semelhanca: r.semelhanca, forca: forca,
                 reaberto: Object.prototype.hasOwnProperty.call(dispensados, p.uid),
                 corroboracoes: r.corroboracoes });
  }
  // celular é prova prática; nome é forte mas discutível — o mais forte vem primeiro
  todos.sort((a, b) => (a.motivo === 'celular' ? -1 : 0) - (b.motivo === 'celular' ? -1 : 0));
  return { suspeito: todos.length ? todos[0] : null, todos };
}

/** Frase da pergunta. O contato vem MASCARADO — o cliente nunca recebe uid nem valor cheio. */
function textoDaPergunta(nome, contatoMascarado, motivo, semelhanca) {
  // ⚠️ NUNCA AFIRMA. Ordem do dono (06/ago): _"não é 'você já está inscrito'. É 'você PARECE
  // já estar inscrito nesse torneio com a conta tal'"_. A diferença não é estilo: afirmar
  // "você já está inscrito" MENTE quando são duas pessoas homônimas de verdade (o caso das
  // duas contas "Nelson Barth"), e ainda por cima não diz COM QUAL conta — que é a única
  // informação que deixa a pessoa agir. O texto sempre nomeia a conta, mascarada.
  const quem = contatoMascarado ? ('a conta ' + contatoMascarado) : 'outra conta';
  if (motivo === 'celular') {
    return 'Você PARECE já estar inscrito neste torneio com ' + quem +
      ' — ela tem o mesmo celular que o seu. É você?';
  }
  // ⚠️ v1.8.3 — o nome nem sempre é o MESMO; pode ser a mesma pessoa escrita de outro
  // jeito ("M.Delia Fernandez" × "MDelia Fernandez", "Debora" × "Dėbora"). Dizer
  // "que usa o mesmo nome" nesses casos é falso, e falso é o que faz a pessoa responder
  // "não sou eu" achando que o app se enganou. O texto descreve o que de fato bateu.
  const comoBateu = (semelhanca && semelhanca !== 'identico')
    ? 'que usa um nome quase igual ao seu ("' + String(nome || '') + '")'
    : 'que usa o mesmo nome ("' + String(nome || '') + '")';
  return 'Você PARECE já estar inscrito neste torneio com ' + quem +
    ', ' + comoBateu + '. ' +
    'Se for você, dá pra unir as duas contas — seus jogos e seu histórico ficam num lugar só. ' +
    'Se for outra pessoa, é só dizer que não é você.';
}

module.exports = {
  normalizarNome, normalizarTelefone, normalizarEmail, normalizarHandle,
  chaveNome, chaveSobrenome, chavePrimeiroNome, temInicialAbreviada, chavesDeBusca, distanciaNome,
  tokensNome, tokensSemIniciais, tokenCompativel, compararNomes, subconjuntoDeNome,
  compararPessoa, detectarMesmaPessoa, textoDaPergunta,
  FORCA_SINAL, forcaDoSinal, mapaDeDispensados,
  MIN_LEN_1CHAR, MIN_LEN_2CHAR, MIN_TOKENS_SUBCONJUNTO,
};

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
 * ═══ PROIBIDOS (testados e reprovados pelo dono) ═══
 *   • SUBCONJUNTO de tokens do nome ("Iliane Garcia" ⊂ "Iliane Geraldi Garcia"):
 *     _"é um pulo para problema… já apurei 30% de acerto nisso no passado"_.
 *   • Mesma data de nascimento + mesmo primeiro nome: _"me parece pouco"_.
 *   Há teste travando os dois fora do motor — não são "ainda não implementados".
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

/** Handle do letzplay comparável (sem @, sem caixa). */
function normalizarHandle(s) {
  return String(s == null ? '' : s).trim().replace(/^@+/, '').toLowerCase();
}

/**
 * Compara o candidato com UMA pessoa já inscrita.
 * @returns {{motivo:string, corroboracoes:string[]}|null}
 */
function compararPessoa(candidato, pessoa) {
  if (!candidato || !pessoa) return null;
  if (!pessoa.uid || !candidato.uid) return null;
  if (pessoa.uid === candidato.uid) return null;             // é ela mesma

  const telA = normalizarTelefone(candidato.telefone);
  const telB = normalizarTelefone(pessoa.telefone);
  const nomeA = normalizarNome(candidato.nome);
  const nomeB = normalizarNome(pessoa.nome);
  const lzA = normalizarHandle(candidato.letzplayHandle);
  const lzB = normalizarHandle(pessoa.letzplayHandle);

  const mesmoTel = !!(telA && telB && telA === telB);
  const mesmoNome = !!(nomeA && nomeB && nomeA === nomeB);
  const mesmoLz = !!(lzA && lzB && lzA === lzB);

  // letzplay NÃO dispara sozinho — só reforça. Regra do dono.
  if (!mesmoTel && !mesmoNome) return null;

  const corroboracoes = [];
  if (mesmoTel && mesmoNome) corroboracoes.push('nome');
  if (mesmoLz) corroboracoes.push('letzplay');

  return { motivo: mesmoTel ? 'celular' : 'nome', corroboracoes };
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
function detectarMesmaPessoa(candidato, pessoas) {
  const dispensados = {};
  ((candidato && candidato.dispensados) || []).forEach((u) => { if (u) dispensados[u] = true; });

  const todos = [];
  for (const p of (Array.isArray(pessoas) ? pessoas : [])) {
    if (!p || dispensados[p.uid]) continue;
    const r = compararPessoa(candidato, p);
    if (r) todos.push({ uid: p.uid, motivo: r.motivo, corroboracoes: r.corroboracoes });
  }
  // celular é prova prática; nome é forte mas discutível — o mais forte vem primeiro
  todos.sort((a, b) => (a.motivo === 'celular' ? -1 : 0) - (b.motivo === 'celular' ? -1 : 0));
  return { suspeito: todos.length ? todos[0] : null, todos };
}

/** Frase da pergunta. O contato vem MASCARADO — o cliente nunca recebe uid nem valor cheio. */
function textoDaPergunta(nome, contatoMascarado, motivo) {
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
  return 'Você PARECE já estar inscrito neste torneio com ' + quem +
    ', que usa o mesmo nome ("' + String(nome || '') + '"). ' +
    'Se for você, dá pra unir as duas contas — seus jogos e seu histórico ficam num lugar só. ' +
    'Se for outra pessoa com o mesmo nome, é só dizer que não é você.';
}

module.exports = {
  normalizarNome, normalizarTelefone, normalizarHandle,
  compararPessoa, detectarMesmaPessoa, textoDaPergunta,
};

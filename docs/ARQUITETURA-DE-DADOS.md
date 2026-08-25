# Arquitetura de dados — o desenho certo, e por que o atual tem um teto

> Escrito em 25/ago/2026, depois de um dia inteiro de correções de sintoma.
> A pergunta do dono: _"se fôssemos desenhar essa arquitetura do zero, com volume de
> dados 10 mil vezes maior, como seria?"_ — e ela expõe que o problema não é
> desempenho. É **um teto**.

---

## 1. O fato que decide tudo

Documento do Confra, medido no ar:

| parte | tamanho |
|---|---|
| `rounds` (os jogos) | **101,2 KB** |
| `participants` | 35,9 KB |
| `history` | 33,4 KB |
| `opponentHistory` | 13,1 KB |
| `standings` | 12,5 KB |
| `categoryNotifications` | 12,2 KB |
| **documento inteiro** | **236 KB** |

São **144 inscritos e 112 jogos**. Custo unitário: **255 bytes por inscrito**,
**925 bytes por jogo**.

**O Firestore limita um documento a 1 MB.** Onde isso estoura:

| escala | inscritos | jogos | documento | |
|---|---|---|---|---|
| 1× (hoje) | 144 | 112 | 236 KB | ok |
| 2× | 288 | 448 | 575 KB | ok |
| **5×** | 720 | 2.800 | **2.808 KB** | ⛔ **impossível salvar** |
| 10× | 1.440 | 11.200 | 10,5 MB | ⛔ |

> ⚠️ **O aplicativo tem um teto rígido em torno de 3 a 4 vezes o Confra.** Um torneio
> de 700 pessoas **não pode ser gravado**. Não é lentidão — é recusa do banco.

E há o efeito diário: **lançar um placar reescreve os 236 KB inteiros.** É por isso
que placar concorrente briga, que a tela demora, e que a rede é cara.

---

## 2. Como seria desenhado do zero

Três camadas, com **tamanhos e ciclos de vida diferentes** — nenhuma cresce com o
tamanho do torneio.

### Camada 1 — ÍNDICE (o que as listas leem)
`tournaments_summary/{id}` · **~2 KB, constante**

Nome, modalidade, local, datas, status, contagens, progresso, `memberUids`, termos de
busca. É **tudo** que um cartão precisa. As listas nunca leem outra coisa.
✅ **Já existe e está em produção** (gatilho `tournamentSummary`, 38 torneios).

### Camada 2 — CONFIGURAÇÃO (o torneio em si)
`tournaments/{id}` · **~5-10 KB, estável**

Só as regras: formato, fases, categorias, critérios de desempate, datas, quadras.
Não cresce com inscritos nem com jogos. Lida ao ABRIR o torneio.

### Camada 3 — VOLUME (subcoleções, uma linha por coisa)
```
tournaments/{id}/matches/{matchId}        ~925 B por jogo
tournaments/{id}/participants/{uid}       ~255 B por inscrito
tournaments/{id}/history/{eventId}        append-only, nunca lido junto
```

É isto que remove o teto: **nenhum documento cresce**. 10.000 jogos são 10.000
documentos de 925 bytes, não um documento de 9 MB.

E resolve a escrita: **lançar um placar toca UM documento de 925 bytes.** Duas pessoas
lançando ao mesmo tempo não disputam mais o mesmo documento.

### Camada 4 — DERIVADOS NO SERVIDOR
Classificação, contagens, progresso: calculados por **gatilho**, gravados no índice.
O cliente **nunca** recalcula — hoje ele recalcula a cada desenho.
✅ O caminho já existe (`tournament-summary-core.js` usa as funções do próprio app).

### Camada 5 — AÇÕES SÃO FUNÇÕES DE SERVIDOR
Inscrever, sortear, lançar placar, avançar fase: Cloud Function. O cliente **nunca**
reescreve o torneio. ✅ Já é assim para sorteio e inscrição.

---

## 3. O que cada tela lê, nesse desenho

| tela | lê | tamanho |
|---|---|---|
| inicial | índice, `limit(20)`, filtros no servidor, paginada | ~40 KB para 20 cartões |
| abrir torneio | configuração + jogos da **rodada corrente** | ~10 KB + o que cabe na tela |
| chave inteira | `matches` por fase, paginado | proporcional ao que se vê |
| meu grupo | `where(grupo == meu)` | 3 documentos |

**Custo proporcional ao que está na tela** — nunca ao tamanho do torneio.
É literalmente o que o dono descreveu: _"cada card ser desenhado de forma leve e puxar
as informações que vão nele, com os botões que disparam funções no servidor"_.

---

## 4. Caminho de migração (incremental, sem parar o app)

**Fase 1 — listas leem o índice.** Sem migrar dado nenhum.
`loadMyTournaments` e a descoberta passam a ler `tournaments_summary` com `limit()`;
abrir um torneio busca o documento completo (`_ensureTournamentLoaded`, que já existe).
⇒ Tira ~95% dos bytes do caminho quente. **Risco baixo, peças prontas.**
⚠️ Medido: dos 170 usos de `AppStore.tournaments`, nenhum acessa `matches`/`rounds`/
`participants` direto — todos passam por funções já cobertas.

**Fase 2 — `matches` vira subcoleção.** É a que **remove o teto**.
Escrita dupla → backfill → troca da leitura → remoção do campo antigo. Cada passo
reversível, com o gate de testes a cada um.

**Fase 3 — `participants`, `history`, `standings` idem.** `history` é o mais fácil
(append-only, ninguém lê junto) e são 33 KB.

---

## 5. O que eu fiz hoje, e o que isso vale

Reduzi elementos de tela: janelas fora do arranque (2.0.84), histórico sob demanda
(2.0.86), chave sob demanda (2.0.88), índice de nomes O(n²) (2.0.78). Medido no
aparelho do dono: **8.061 → ~700 elementos**, travadas de 3.766ms → ~700ms.

**Mas são compensações.** Todas existem porque a tela carrega dados que não precisa.
Nenhuma delas move o teto do item 1. Com o desenho acima, a maioria delas deixa de ser
necessária — a tela fica leve porque **o dado que chega já é pequeno**, não porque o
desenho foi adiado.

⛔ **Este é o erro a não repetir:** eu tratei sintoma (o que é desenhado) por um dia
inteiro, quando a causa era o modelo de dados (o que é carregado). O dono apontou o
caminho três vezes antes de eu medir o teto.

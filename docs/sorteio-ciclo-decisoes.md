# Ciclo de decisões do pré-sorteio — mapa lido do código (jul/2026)

Levantado LENDO o código na v1.2.28 (`claude/nostalgic-yalow-721a34` + main). Cada linha
aponta arquivo:linha. Serve de base pra mover a APLICAÇÃO das decisões pra CF `drawRound`,
mantendo a ESCOLHA (UI) no cliente.

Regra que este documento existe pra sustentar: **escolha = UI = cliente; aplicação da
escolha ao elenco = lógica = CF**. As funções abaixo já estão configuradas e testadas —
o trabalho é vendorá-las e chamá-las, nunca reescrevê-las.

---

## 1. Portas de entrada (são DUAS, não uma)

### Entrada A — botão "Sortear" (`_handleSortearClick`, tournaments.js:1469)

| # | Gate | Condição | O que faz | Persiste? |
|---|------|----------|-----------|-----------|
| G1 | **Escopo** `_showPresenceDrawChoice` (tournaments.js:1367) | inscrições NÃO fechadas E lateEnrollment ∈ {standby, expand} | 2 opções: `all` (default) \| `present`. Liga pula (sempre `all`, L1375) | `present` → `_moveAbsentToWaitlistForPresentDraw` (L1343) via `AppStore.mutate` → **SIM** |
| G2 | Encerrar inscrições | inscrições NÃO fechadas E não-lateMode | confirm → `status='closed'` + `_reopenIfDrawCancelled=true` | **SIM** (saveTournament) |
| G3 | — | `status === 'closed'` | vai direto | — |

### Entrada B — "Sortear entre os presentes" (`_drawPresentOnly`, participants.js:684)

Particiona presentes×ausentes; **se houver ausentes** → `_showAbsenteeResolutionDialog`
(participants.js:729) — **1 decisão, 3 opções**: `waitlist` \| `disqualify` \| cancelar.
Aplica em `_resolveAbsenteesThenDraw` (L773) pelo núcleo PURO `_applyRoll` (L780) via
`AppStore.mutate` → **PERSISTE** → chama `_handleSortearClick(tId, false)`.

> ⚠️ **DIVERGÊNCIA CÓDIGO × INTENÇÃO DO DONO — reportar, não consertar aqui.**
> O dono afirmou: *"a decisão do que fazer com os ausentes só existe se sortear entre
> TODOS; sorteando só entre os presentes a pergunta não existe"*. O código faz o
> **inverso**: a pergunta de 3 opções só existe no caminho **presentes** (Entrada B).
> No caminho **todos** não há pergunta nenhuma — `_autoMoveAbsentToStandby` (tournaments.js:1295)
> move em SILÊNCIO quem está marcado ausente (W.O.) pra `standbyParticipants`. E em G1
> (Entrada A), escolher `present` também não pergunta: `_moveAbsentToWaitlistForPresentDraw`
> manda todo não-presente pra espera, calado.
> Ou seja: hoje existem **três** tratamentos diferentes de ausente em três caminhos.
> Isso é um bug à parte (de UX/consistência), fora do escopo desta canonização.

---

## 2. `_startDraw` (tournaments.js:1471) — a cadeia

| # | Etapa | Onde | Decisão? | Muta elenco? | Persiste? |
|---|-------|------|----------|--------------|-----------|
| S0 | **SNAPSHOT** `_drawPrepSnapshots[tId]` | L1484-1495 | — | não | não (vive FORA do doc) |
| S1 | **Sem-dupla** `_showSoloResolutionPanel` (draw-prep.js:1642) | L1500-1511 | **1 decisão, 3 opções**: `manual` \| `waitlist` \| `exclude` | `_soloMoveOut(tt, toWaitlist)` (draw-prep.js:1593) | **NÃO** — L1609-1616 diz explicitamente que só o commit torna permanente |
| S2 | Sem nenhum time formado | L1517-1532 | aborta (`_warnTeamsNotFormed`) | não | — |
| S3 | `_autoMoveSoloToWaitlist` (L1254) | L1533 | automático (pula se pareamento manual) | sim | **NÃO** |
| S4 | `_autoMoveAbsentToStandby` (L1295) | L1537 | automático | sim | **SIM** se >0 (`AppStore.mutate`, L1552-1562) |
| S5 | **Equilíbrio** `_maybeShowGenderDrawDialog` → `_gdConfirm` (draw.js:1048) | L1566 | **1 decisão, 2 opções**: `livre` \| `equilibrado` (`t._drawBalanceMode`, draw.js:1062) + gêneros por uid | gêneros nos participants | **SIM** (saveTournament, L1072) |
| S6 | `showUnifiedResolutionPanel` | L1542-1546 | → seção 3 | — | — |

---

## 3. Painéis de resolução — decisões SEPARADAS, cada uma com opções próprias

`_diagnoseAll` (draw-prep.js:24) calcula: `incompleteTeams`, `remainder`, `isOdd`,
`isPowerOf2`, `loP2`/`hiP2`, `excess`/`missing`, `effectiveTeams`, `totalPeople`.

### 3.1 RESTO — `_showRemainderPanel` (draw-prep.js:397)
**1 decisão, 3 opções** + **1 método**:
- opções: `reabrir` (→ `_showReopenPanel`) | `standby` (espera) | `exclusion`
- método (toggle "Sorteio Geral", L471-477): `random` (default) | `last` → quem sai
- aplica: `_applyRemainderAction` (L562) → **`_executeRemoval(tId, mode, method)` (L624)**
- **PERSISTE** (`saveTournament` full-doc, L696) → re-diagnostica → sorteia ou reabre painel

### 3.2 POTÊNCIA DE 2 — `showPowerOf2Panel` → `_handleP2Option` (draw-prep.js:2929)
**1 decisão, 6 opções**: `reopen` | `bye` | `playin` | `standby` | `swiss` | `exclusion` (+ `poll`)
- `bye`/`playin`/`standby`/`swiss` → **`_confirmP2Resolution` (L3599)**: grava
  `p2Resolution`, `p2TargetCount`, `p2CrossSeed`, `standbyPick` (`last`|`random`, radio
  `standby-pick`, L3648), `standbyMode` (radio `standby-mode`, L3667), `classifyFormat`,
  `swissRounds`, e no `standby` MOVE o excedente (L3650-3665, respeita VIP, conta em PLAYERS)
- `exclusion` → confirm → `splice` dos últimos N (L2960) + `p2Resolution='exclusion'`
- **NÃO PERSISTE** — v4.5.7 tirou o `sync()` DE PROPÓSITO (L3683-3689: o sync clobberava a
  chave → sorteio-fantasma). Persiste de carona no delta do `_commitInitialDraw`.

### 3.3 GRUPOS — `_showGroupsConfigPanel` (draw-prep.js:106) / `_grupos_f2Direct` (L11)
Com `fmt2` + `gruposCount` já definidos: fecha, salva e sorteia direto (sem re-perguntar).

### 3.4 TIMES INCOMPLETOS — `_handleIncompleteOption` (draw-prep.js:1767)
`reopen` | `lottery` | `standby` | `dissolve` (+ `poll`) → `t.incompleteResolution` +
**`AppStore.sync()`** → persiste.

### 3.5 ÍMPAR — `_handleOddOption` (draw-prep.js:2010)
`reopen` | `bye_odd` (→ `oddResolution='bye_rotative'`) | `exclusion` (splice do último)
(+ `poll`) → **`AppStore.sync()`** → persiste.

### 3.6 Cancelar — `_cancelDrawResolution` (draw-prep.js:517)
Restaura o snapshot (participants/waitlist/standby/monarchWaitlist/teamOrigins),
reabre status (`_suspendedByPanel` / `_reopenIfDrawCancelled`), limpa flags e
**salva**. Vale pra QUALQUER painel da cadeia (L550) → decisões reavaliadas do zero
no próximo Sortear.

---

## 4. Onde está o furo (por que a CF sorteou o elenco velho)

`generateDrawFunction` (draw.js) monta `_preDraw` usando o **snapshot** como baseline do
roster (L1501-1515) e `_commitInitialDraw` grava **o delta**. É o delta que carrega, de
carona, TODAS as decisões que mexeram no elenco em memória:

- S1 sem-dupla → espera/exclusão (**memória**)
- S3 `_autoMoveSoloToWaitlist` (**memória**)
- 3.2 pow2 `standby`/`exclusion` (**memória**, por decisão explícita da v4.5.7)

Trocando `_commitInitialDraw` pela CF, esse delta **deixa de existir** → o servidor lê o
doc, que ainda tem o elenco velho. Foi exatamente o que a v1.2.28 reverteu:
35 inscritos → 18 entradas → chave de 32 com 14 BYEs.

> O comentário de `draw-core.js:300-304` afirma que *"esses painéis já gravam a decisão no
> doc"*. **É FALSO** pros três itens acima e foi essa suposição que quebrou o sorteio.
> Corrigir o comentário faz parte do trabalho.

---

## 5. O pacote de decisões (contrato cliente → CF)

Nomes = os campos que JÁ existem no código. O cliente coleta; a CF aplica com as MESMAS
funções (vendoradas), sobre o doc fresco, dentro da transação.

```js
// request.data.decisions
{
  scope:      'all' | 'present',                                  // G1
  absentees:  'waitlist' | 'disqualify' | null,                   // Entrada B
  solo:       'waitlist' | 'exclude' | null,                      // S1
  balanceMode:'livre' | 'equilibrado' | null,                     // S5 → t._drawBalanceMode
  remainder:  { mode: 'standby'|'exclusion', method: 'random'|'last' } | null,  // 3.1
  p2:         { option: 'bye'|'playin'|'standby'|'swiss'|'exclusion',
                pick: 'last'|'random', mode: 'teams'|'players',
                swissRounds: Number|null } | null,                // 3.2
  odd:        'bye_rotative' | 'exclusion' | null,                // 3.5
  incomplete: 'standby'|'lottery_direct'|'dissolve' | null,       // 3.4
  allowRedraw: Boolean                                            // _redrawConfirmed
}
```

**Ordem de aplicação no servidor** (a mesma do cliente hoje):
`scope/absentees` → `solo` → auto-move solo → auto-move ausente → `incomplete` → `odd`
→ `remainder` → `p2` → `drawInitial`.

**Precedente de extração:** `identity-core.js` e `persist-core.js` foram extraídos do
store.js exatamente porque espelhar criaria uma 2ª versão do código. O mesmo vale aqui:
os núcleos PUROS que hoje vivem dentro de handlers com DOM (`_executeRemoval`,
`_confirmP2Resolution`) precisam ser **extraídos** (não copiados) pra um módulo que
cliente e CF compartilham — como `_applyRoll` (participants.js:780) e `_soloMoveOut`
(draw-prep.js:1593) já são hoje.

`tournaments-draw-prep.js` **carrega limpo em Node** (verificado: DOM só dentro de
funções; expõe 61 funções) → pode ser vendorado igual `tournaments-draw.js`.

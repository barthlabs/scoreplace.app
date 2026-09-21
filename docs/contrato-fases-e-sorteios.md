# Contrato de fases e sorteios

Este contrato substitui a interpretação de rótulos antigos como modelo de
domínio. Ele preserva leitura de torneio histórico por adaptador e não
autoriza regravar `phases[]` já materializadas.

## Tipos fechados

Todo torneio tem uma ou mais fases ordenadas. Cada fase tem exatamente um
`kind`:

```js
kind: 'classification' | 'elimination'
```

Não há `liga`, `grupos`, `rei_rainha`, `super8` ou `dupla_eliminatoria` como
tipo de fase. Esses valores descrevem estrutura, modalidade ou política.

```js
{
  schemaVersion: 1,
  kind,
  entrants: { source: 'enrollments' | 'previous_phase', categoryIds: [] },
  competition: { teamSize: 1 | 2 },
  draw: {
    modality: 'standard' | 'monarch' | 'super8',
    teamFormation: 'none' | 'participant' | 'organizer' | 'random',
    pairPersistence: 'phase' | 'round',
    pairing: 'random' | 'performance' | 'balance',
    antiRepeat: { partners: true, opponents: true, sitOuts: true }
  },
  schedule: { mode: 'manual' | 'automatic', firstAt, intervalDays, rounds },
  lateEnrollment: { mode: 'closed' | 'waitlist' | 'expand_before_play' }
}
```

Uma `classification` acrescenta `structure: 'round_robin' | 'groups' |
'swiss'` e suas regras de pontos/desempate. Uma `elimination` acrescenta
`seeding`, `bracketPolicy` e origem por colocação. O schema recusa campos e
combinações fora da modalidade; não os corrige em silêncio.

## Modalidades de sorteio

`standard` forma equipe quando necessário e sorteia confrontos. Em rodada
sucessiva, a dupla pode persistir na fase ou ser sorteada novamente a cada
rodada.

`monarch` é Rei/Rainha: cria grupos de quatro pessoas, três combinações de
dupla e três jogos, com pontuação individual. Não cria uma terceira espécie de
fase. Uma única rodada `monarch` pode ser fase de formação antes de eliminatória
para construir duplas por desempenho ou equilíbrio.

`super8` será modalidade classificatória futura. A expressão “oito duplas,
sete jogos e todos contra todos” ainda requer decisão: todos-contra-todos de
oito duplas são 28 jogos, normalmente sete rodadas de quatro jogos. Sem essa
definição, o schema pode reservar o nome, mas não pode liberar a modalidade.

## Política de chave eliminatória

`bracketPolicy` pertence somente à fase `elimination` e é confirmada antes da
primeira materialização:

```js
'repescagem' | 'bye' | 'sobra_unica'
```

Ela não é apagada por reset parcial e não é inferida novamente a cada tela. A
função planejadora recebe política, entradas, semeadura, seed e histórico de
sobras e produz topologia imutável. O identificador de jogo é alocado pela
sequência global do torneio, não por índice de fase ou rodada.

## Matriz de adaptação do legado

| Campo ou rótulo atual | Destino no adaptador | Observação |
| --- | --- | --- |
| `formatCode: 'liga'`, `format: 'Liga'` | `kind: 'classification'` | Pode representar rodadas classificatórias; não sobrevive como tipo novo. |
| `formatCode: 'grupos_mata'` | `kind: 'classification'`, `structure: 'groups'` | Grupos e pontos corridos de grupo único são a mesma família classificatória. |
| `drawMode: 'rei_rainha'`, `reiRainha: true` | `draw.modality: 'monarch'` | É modalidade, nunca fase. |
| `formatCode: 'elim_simples'` | `kind: 'elimination'`, política explícita | O adaptador precisa identificar a política histórica documentada. |
| `formatCode: 'elim_dupla'` | `kind: 'elimination'`, `bracketPolicy: 'repescagem'` | Não é tipo de fase independente. |
| `ligaRoundFormat`, `ligaDrawMode` | `draw` e `schedule` | Só adaptador; não entram no schema v1. |
| `bracketResolution` | não é contrato v1 | A decisão antiga é hoje ignorada pelo motor e apagada por reset. M4 a substitui por `bracketPolicy`. |

## Fronteira de implementação

1. Manter `fmt2`, `formatCode`, `format`, `ligaRoundFormat` e campos afins só
   no adaptador de entrada/leitura histórica.
2. Introduzir normalizador puro de `phaseConfig` e fixtures equivalentes para
   cada configuração suportada de `format2`.
3. Fazer a Function compilar o intent novo e gravar plano imutável antes do
   primeiro sorteio. O cliente usa a mesma biblioteca apenas para prévia.
4. Extrair os planejadores testados de grupos, classificação, Rei/Rainha e
   eliminatória atrás da mesma interface. Não reimplementar sua matemática por
   rótulo.
5. Só após paridade de fixtures, parar de gravar campos antigos em fases novas.
   Torneio histórico continua legível pelo adaptador até o censo permitir sua
   retirada.

## Fatos atuais que bloqueiam uma troca textual

- `format2.js` ainda compila Rei/Rainha como `formatCode: 'liga'` e
  `drawMode: 'rei_rainha'`.
- `phases-engine.js` classifica `liga` como `league` e declara que ignora
  `bracketResolution`.
- `tournaments-draw.js` remove `bracketResolution` durante reset.
- O teste de paridade cliente/servidor prova que `format2` é comportamento
  compartilhado. Alterá-lo sem matriz de equivalência quebraria cliente,
  Functions e autodraw ao mesmo tempo.

Esses fatos tornam a migração de M2 uma extração por contrato, não uma troca de
strings ou exclusão de arquivos.

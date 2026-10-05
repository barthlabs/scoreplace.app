# 2.3.277 — Agenda Geral da chave concentrada

## Escopo autorizado

O pedido é uma aba **Geral** na mesma linha de `Light`, `Power` e `Extreme`, antes delas. Ela não é uma aba de gênero: é a agenda do **dia selecionado**. No Neon, os dias hoje coincidem com Feminina e Masculina, mas essa coincidência não define a regra. Se categorias de gêneros diferentes estiverem no mesmo dia, entram juntas na mesma agenda.

Entrou no corte 2.3.277 porque o pedido foi feito durante a validação da própria chave concentrada, antes de qualquer publicação web posterior a 2.3.276. Separar em nova versão deixaria a correção de renderização e a leitura operacional da mesma tela em releases artificiais. O corte permanece único: 2.3.277.

## Comportamento

- `Geral` aparece apenas em agenda concentrada com horários válidos para o dia representado pela aba principal.
- Ela reordena os **mesmos cards** por horário estimado e, no empate, por quadra. Não clona campos, botões, ids ou placares.
- Ao voltar para uma categoria, cada card volta ao seu placeholder canônico.
- Um rerender — inclusive após lançar placar — restaura os cards antes de destruir a agenda transitória, para não deixar wrapper ou portal órfão.
- Sem `scheduledAt` válido não existe aba Geral. Não há botão inerte nem tela vazia.

## Contraste e temas

A faixa das abas e a agenda usam a superfície opaca canônica `#111114`, inclusive quando o restante do app muda de tema; por isso não há mistura de fundo claro sob o controle. A aba selecionada usa texto `#fde68a` sobre a superfície escura e a principal usa texto escuro sobre amarelo. A apresentação será exercitada no Chromium pela suíte da agenda e permanece no mesmo componente/tab strip já usado pelas categorias, sem criar uma segunda paleta.

## Verificação

`tests/bracket-geral-agenda.test.js` executa no Chromium: clicar Geral, ordenar por horário/quadra, reunir gêneros no mesmo dia, não duplicar ids, restaurar ao clicar uma categoria, limpar durante rerender e recusar agenda sem horário válido. A suíte entra em `npm test`.

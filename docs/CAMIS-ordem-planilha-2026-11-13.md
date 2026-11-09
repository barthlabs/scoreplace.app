# Conferência da ordem do CAMIS — 13/11/2026

Referência: planilha enviada pela organização em 09/11/2026 (imagem de 07/11). Esta conferência é somente de código e agenda; não altera os dados do torneio.

## Resultado da comparação antes da correção

- Os 108 jogos classificatórios existentes têm números globais distintos: Diamante 1–24, Ouro 25–72 e Prata 73–108. Cada quarteto tem três jogos consecutivos.
- Diamante começa às 08h00, Ouro em duas ondas às 09h40 e 11h20. Isso coincide com a planilha.
- A agenda atual começa a Prata às 13h00 e 14h40. Nesse horário, a planilha coloca as quartas do Diamante e as oitavas do Ouro. Portanto, a ordem de chamamento atual **não coincide** com a planilha.
- O avanço de fase usa `currentPhaseIndex` único e `phaseComplete(t)` exige todos os grupos da classificatória concluídos. Assim, hoje não consegue gerar a eliminatória do Diamante/Ouro enquanto a Prata ainda joga a classificatória.
- O cadastro atual encerra a janela do dia às 19h30, antes da semifinal e da final da Prata previstas na planilha.
- Os jogos eliminatórios ainda não foram gerados. Portanto, a numeração única de todos os jogos futuros e a sequência completa de chamamento ainda não foram comprovadas.

## Sequência que preserva a ordem com 25 + 5 + 5 minutos nas eliminatórias

Os três jogos de cada quarteto continuam com a duração da classificatória configurada no torneio: primeira partida 40 minutos (jogo de 30 + chamada 5 + aquecimento 5), seguintes de 30 minutos cada. Cada bloco ocupa 100 minutos. A organização confirmou 35 minutos por jogo eliminatório (jogo de 25 + chamada 5 + aquecimento 5).

| Início | Quadras | Atividade | Fim do último jogo |
|---|---:|---|---:|
| 08h00 | 1–8 | Diamante, grupos 1–8 | 09h40 |
| 09h40 | 1–8 | Ouro, grupos 1–8 | 11h20 |
| 11h20 | 1–8 | Ouro, grupos 9–16 | 13h00 |
| 13h00 | 1–4 | Diamante, quartas 1–4 | 13h35 |
| 13h00 | 5–8 | Ouro, oitavas 1–4 | 13h35 |
| 13h40 | 1–2 | Diamante, semifinais | 14h15 |
| 13h40 | 3–6 | Ouro, oitavas 5–8 | 14h15 |
| 14h20 | 1–2 | Diamante, final e terceiro lugar | 14h55 |
| 14h20 | 3–6 | Ouro, quartas 1–4 | 14h55 |
| 15h00 | 1–2 | Ouro, semifinais | 15h35 |
| 15h00 | 3–8 | Prata, grupos 1–6 | 16h40 |
| 15h40 | 1–2 | Ouro, final e terceiro lugar | 16h15 |
| 16h40 | 1–6 | Prata, grupos 7–12 | 18h20 |
| 18h20 | 1–4 | Prata, oitavas 1–4 | 18h55 |
| 19h00 | 1–4 | Prata, quartas 1–4 | 19h35 |
| 19h40 | 1–2 | Prata, semifinais | 20h15 |
| 20h20 | 1–2 | Prata, final e terceiro lugar | 20h55 |

Essa tabela conserva a ordem da planilha, mantém cada bloco classificatório na mesma quadra e não ocupa uma quadra duas vezes no mesmo intervalo. O horário de encerramento deve ser pelo menos 20h55; 21h00 deixa uma margem de cinco minutos.

A organização confirmou em 09/11/2026 que o local estará disponível até 21h00. O código do corte 2.6.20 implementa a grade como plano opt-in e o teste de integração cobre os 144 números e as 36 duplas de classificação. A configuração do torneio de produção ainda precisa ser aplicada após a revisão do diff e aprovação do patch específico.

## Portas de código alteradas neste corte

1. Permitir materialização e exibição da eliminatória por categoria, sem exigir o encerramento da classificatória das outras categorias. A autorização precisa ser transacional e baseada nos resultados de todos os grupos daquela categoria.
2. Reservar as faixas de quadra para as eliminatórias futuras antes de alocar os blocos classificatórios da Prata. A grade automática atual só conhece os jogos já gerados.
3. Distinguir duração da classificatória (30 minutos de jogo) da eliminatória (25 minutos de jogo) na configuração e no cálculo da agenda.
4. Validar janela diária, ausência de sobreposição em quadras e atletas, precedência entre rodadas e numeração global única após cada materialização. Não publicar uma agenda que falhe alguma dessas invariantes.
5. Ensaiar com o sorteio refeito e com resultados progressivos, conferindo que Diamante/Ouro entram nas eliminatórias enquanto a Prata segue na classificatória.

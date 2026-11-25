# CULT — conferência do regulamento em 25/11/2026

Fonte visual: sete capturas fornecidas pela organização, de 13:01:28 a 13:02:18. A página original não pôde ser lida por bloqueio de acesso. O documento foi reconstruído com fontes abertas visualmente próximas, paleta e blocos equivalentes; não se afirma identidade binária ou tipográfica com a página original.

## Configuração conferida em leitura

Leitura administrativa somente do documento CULT, com credencial persistente; nenhum campo, inscrição, jogo ou resultado foi alterado. Snapshot integral fica privado, fora do repositório. Projeção feita com `ScoreplacePhaseGridPlan.project(t,w)` carregado pelo motor `functions-autodraw/draw-core`. O estado lido não tinha sorteio publicado nem partidas. Valores genéricos abaixo não incluem dados pessoais.

| Regra | Categoria B · retinol | Categoria C · colágeno |
| --- | --- | --- |
| Capacidade | 16 atletas | 32 atletas |
| Grupos | 2 de 8 | 4 de 8 |
| Rodízio | 7 rodadas, sem repetir parceira | 7 rodadas, sem repetir parceira |
| Partidas | 7 por atleta; 14 por grupo | 7 por atleta; 14 por grupo |
| Corte | 4 primeiras de cada grupo | 2 primeiras de cada grupo |
| Fase final | 8 atletas, 4 duplas fixas | 8 atletas, 4 duplas fixas |
| Etapas | Semifinais, final e terceiro lugar | Semifinais, final e terceiro lugar |

A organização confirmou expressamente que o desenho de quartas estava errado e solicitou corrigir para semifinais. Confirmou também a diferença de grupos e cortes entre B e C. A configuração existente já corresponde a essa decisão; não houve mudança do torneio.

### Cruzamentos conferidos na projeção canônica

Letras do documento são locais a cada categoria: A/B equivalem a B1/B2; A/B/C/D equivalem a C1/C2/C3/C4.

- C SF1: 1ª+2ª do grupo1 contra 1ª+2ª do grupo4. SF2: 1ª+2ª do grupo2 contra 1ª+2ª do grupo3.
- B SF1: 1ª+2ª do grupo1 contra 3ª+4ª do grupo2. SF2: 1ª+2ª do grupo2 contra 3ª+4ª do grupo1.
- Final: duplas vencedoras das semifinais. Terceiro lugar: duplas perdedoras.

Cada origem e posição foi comparada com `jobs[].display.sources`, não inferida do desenho incorreto das capturas.

### Placar e classificação

A configuração efetiva usa sete games totais. Os quatro placares 7-0,6-1,5-2,4-3 foram aceitos pelo aplicador real `_applyResultToTournament` em cópias sintéticas em memória. Não se reinterpretaram os espelhos antigos de vantagem como exigência de dois games de diferença: sem `customRulesVersion:1`, o comportamento preservado do set fixo é sete games totais.

Classificação primária: vitórias. Desempate: saldo de games, confronto direto e, residualmente, ordem do sorteio original (`fmt2.tieResolution=draw_order`), sem novo sorteio na transição. A arte omitia o critério residual e o terceiro lugar.

## Alterações em relação às capturas

1. “Quartas, semifinal e final” → semifinais, final e terceiro lugar, conforme confirmação e configuração.
2. Chave C de quatro confrontos de atletas → duas semifinais de duplas, com os cruzamentos projetados acima.
3. Categoria B completada com dois grupos de oito, quatro classificadas por grupo e desenho das semifinais já conferido. Não se alegou transcrição de uma aba B não fotografada.
4. Explicitação de oito atletas formando quatro duplas fixas em ambas as categorias.
5. Inclusão do terceiro lugar e do critério residual já configurados.
6. “São sete partidas” → sete por atleta, 14 por grupo; 49 games por atleta. Não são sete partidas por grupo.
7. Retirada da promessa de pausa entre todas as partidas: sete rodadas podem ser consecutivas com oito atletas em duas quadras. O texto descreve duas entradas e remete intervalos à programação.
8. Explicitação de vitórias como classificação primária. Demais informações substantivas das capturas foram mantidas.

## Artefatos e verificações

HTML e PDF locais usam a mesma fonte de conteúdo. O gerador `tools/generate-cult-regulation-pdf.cjs` imprime o HTML em Chromium isolado, sem rede externa, e registra SHA256 de ambos no manifesto. O teste confere hashes, texto do PDF, ausência de quartas, cortes, quatro páginas, isolamento por identidade e contraste AA. Todas as páginas foram renderizadas com Poppler e inspecionadas. Desktop e mobile são verificados com dados sintéticos; não se usa o navegador pessoal nem se grava em produção.

## Implementação final por arquivo

O usuário determinou que a arte pertença ao banco do torneio, com upload e substituição pelo organizador. Por isso não há desvio por ID do CULT em rules.js. O documento corrigido é preservado em docs/regulamentos/cult-2026 como artefato de entrega; o app lê regulations/current dentro do torneio e exibe o original do Storage. A operação administrativa para anexar esse PDF foi expressamente autorizada, com ator administrativo identificado, backup privado, CAS e conferência de bytes, sem simular autenticação de organizador.

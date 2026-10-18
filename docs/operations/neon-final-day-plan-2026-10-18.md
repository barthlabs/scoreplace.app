# Neon Nightmare — distribuição final de dias

Em 18/10/2026, a planilha `Participantes Neon Nightmare.xlsx` foi confrontada com as 64 duplas confirmadas do torneio de produção `tour_1790628592058_c342a1e8f5068424887f1702a1633a44`. O pareamento foi único para todas as 64 duplas, sem divergência de categoria. A diferença de nome da parceira de Alessandra Feltrini Massa foi resolvida pelo organizador a favor de Camila Putignani, já cadastrada no torneio; a planilha não substituiu esse nome.

Uma transação de Firestore, antes de qualquer sorteio (`matches = 0`), gravou `teamCompetition.schedule.originDayPolicy = female-light-organization-final` e 24 `pairDayAssignments` nominais: 16 para 22/10/2026 e 8 para 23/10/2026. A transação verificou novamente a identidade e categoria de cada dupla, registrou o estado anterior em `configurationAudit/spreadsheet-final-2026-10-18` e acrescentou o slot de Fem Light na sexta. A leitura após a transação confirmou a política, os 24 dias, os dois slots e nenhum jogo criado. Nenhuma dupla ou inscrição foi alterada.

O regulamento servido na versão 2.4.104 foi atualizado a partir do PDF final fornecido pela organização (`Regulamento_NEON NIGHTMARE_2026.pdf`).

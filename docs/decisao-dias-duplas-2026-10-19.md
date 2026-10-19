# Decisão: dias configuráveis por dupla

Em 19/10/2026, o organizador pediu que a designação de dias no sorteio por times considere as duplas, não uma exceção fixa para o Neon: as categorias masculinas podem ir para sexta, a Fem Light pode dividir suas duplas entre quinta e sexta e as demais femininas podem ficar na quinta. Pediu também que isso seja configurável no app, sem depender de marcações externas de “dupla 3” vindas da planilha.

Implementação: a configuração nominal existente do Neon é preservada ao abrir o painel. Somente a confirmação de um novo sorteio grava `organizer-pair-days`, o mapa `pairDayAssignments` e `rosterSnapshot`. O organizador pode alterar os dias; o servidor exige roster canônico e lotes equilibrados por time em cada dia, mas não impõe mais a distribuição fixa 16/8. A planilha histórica não pode sobrescrever uma escolha posterior feita no app.

Torneios comuns mantêm o comportamento anterior até o organizador ativar explicitamente “dias por dupla”. Não há alteração de inscritos, categorias, duplas ou jogos existentes por esta mudança de código.

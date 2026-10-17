# Auditoria de origem das duplas Fem Light do Neon — 17/10/2026

Consulta somente de leitura ao Firestore de produção antes do release 2.4.82. Foram lidos `categoryDefinitions` e `registrations` do torneio `tour_1790628592058_c342a1e8f5068424887f1702a1633a44` e do sandbox `sb_tour_1790628592058_c342a1e8f5068424887f1702a1633a44_1792170970128`. A contagem considerou apenas registros `confirmed` de Fem Light com `fixedPairId`, agrupados em duplas de dois integrantes.

| Coleção | Duplas confirmadas | Sem `originCategoryId` | Origem divergente entre integrantes | Origem Fem Light | Origem Masc Light | Origem Masc Extreme |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| `tournaments` | 24 | 0 | 0 | 16 | 6 | 2 |
| `sandboxes` | 24 | 0 | 0 | 16 | 6 | 2 |

Assim, o bloqueio por origem ausente não se aplica às 24 duplas ativas desse torneio nem às do clone: 16 são elegíveis para quinta-feira e 8 para sexta-feira. Há inscrições retiradas e registros de outras categorias sem origem; eles não entram nesse plano. Nenhum dado foi alterado. Esta verificação não prova paridade de todos os fluxos do aplicativo nem resolve automaticamente registros legados de outros torneios.

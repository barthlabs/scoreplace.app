# scoreplace.app — Schemas de Dados (Firestore)

> **Versão**: v0.17.55-alpha → freeze proposto pra **1.0.0-beta**
> **Última auditoria**: durante Sprint 1 (semana 1) do roadmap pra beta.
> **Regra atual (alpha)**: dados descartáveis, sem compat-shim. Em **beta**, esta regra muda — schemas listados aqui são contrato e mudanças exigem migração documentada.

## Coleções

| Coleção | Doc ID | Owner | Pilar | Beta-ready? |
|---|---|---|---|---|
| `users` | `uid` (Firebase Auth) | self | Stats/Perfil | ✅ |
| `tournaments` | `tour_<timestamp>` | `organizerEmail` | Torneios | ✅ |
| `casualMatches` | auto-id | `createdBy` (uid) | Casual | ✅ |
| `presences` | auto-id | `uid` | Presença | ✅ |
| `venues` | `placeId` (Google) ou `<lat>_<lng>_<name>` | first creator | Venues | ✅ |
| `notifications` | sub-coleção em `users/{uid}/notifications/` | recipient | infra | ✅ |
| `matchHistory` | sub-coleção em `users/{uid}/matchHistory/` | self | Stats | ✅ |
| `templates` | sub-coleção em `users/{uid}/templates/` | self | Torneios | ✅ |
| `mail` | auto-id (firestore-send-email extension) | system | infra | ✅ |
| `whatsapp_queue` | auto-id | system (legacy) | — | ⚠️ deprecated, manter? |

---

## 1. `users/{uid}` — Perfil

```typescript
{
  // Identidade (vem do Firebase Auth — nunca editar manualmente)
  uid: string,
  email: string,
  displayName: string,
  photoURL?: string,

  // Search denormalization (auto-set por saveUserProfile)
  email_lower: string,
  displayName_lower: string,

  // Perfil de jogador
  gender?: 'masculino' | 'feminino' | '',
  birthDate?: string, // ISO date "YYYY-MM-DD"
  city?: string,
  state?: string,
  country?: string,
  phone?: string,
  phoneCountry?: string, // "+55" etc
  defaultCategory?: string,

  // Preferências
  preferredSports?: string[], // ['Beach Tennis', 'Tênis']
  preferredCeps?: string[],
  preferredLocations?: Array<{lat, lng, label, sports?, placeId?}>,
  language?: 'pt' | 'en',
  theme?: 'dark' | 'light' | 'sunset' | 'ocean',

  // Notificações
  notifyLevel?: 'todas' | 'importantes' | 'fundamentais',
  notifyPlatform?: boolean,
  notifyEmail?: boolean,
  fcmToken?: string,

  // Presença
  presenceVisibility?: 'public' | 'friends' | 'private',
  presenceMuteDays?: number,
  presenceMuteUntil?: number, // timestamp ms
  presenceAutoCheckin?: boolean,

  // Social
  friends?: string[], // uids
  friendRequestsSent?: string[], // uids
  friendRequestsReceived?: string[], // uids

  // Plano
  plan?: 'free' | 'pro',
  planExpiresAt?: number, // timestamp ms
  stripeCustomerId?: string,

  // Estado ativo
  activeCasualRoom?: string | null, // roomCode da partida casual em curso

  // Timestamps
  createdAt?: string, // ISO
  updatedAt?: string, // ISO
}
```

**Sub-coleções:**
- `users/{uid}/notifications/{notifId}` — notificações push/in-app
- `users/{uid}/matchHistory/{matchId}` — histórico de partidas
- `users/{uid}/templates/{templateId}` — templates de torneio salvos

---

## 2. `tournaments/{tour_<timestamp>}` — Torneios

```typescript
{
  id: string, // 'tour_1234567890123'
  name: string,
  format: 'Eliminatórias Simples' | 'Dupla Eliminatória' | 'Liga' |
          'Suíço' | 'Grupos + Eliminatórias' | 'Rei/Rainha',
  drawMode?: 'sorteio' | 'rei_rainha',
  ligaRoundFormat?: 'standard' | 'rei_rainha',
  sport: string, // 'Beach Tennis', 'Tênis', etc
  isPublic: boolean,
  status: 'open' | 'closed' | 'active' | 'finished',
  enrollmentMode: 'individual' | 'team' | 'mixed',

  // Owners
  organizerEmail: string, // criador
  creatorEmail?: string, // legacy alias
  coHosts?: Array<{email, status: 'pending' | 'active'}>,
  adminEmails?: string[], // denormalized: organizerEmail + active coHosts

  // Members denormalization (pra performance em rules + queries)
  memberEmails: string[], // todos os emails de participants

  // Datas (ISO strings ou timestamps)
  createdAt: string,
  updatedAt?: string,
  startDate?: string,
  endDate?: string,
  registrationLimit?: string, // prazo de inscrição

  // Local
  venue?: string,
  venueLat?: number,
  venueLon?: number,
  venueAddress?: string,
  venuePlaceId?: string,
  venueAccess?: 'public' | 'private',
  venuePhotoUrl?: string,
  courtCount?: number,

  // Inscritos
  participants: Array<string | {
    displayName: string,
    name?: string,
    email?: string,
    uid?: string,
    photoURL?: string,
    gender?: string,
    category?: string,
    categorySource?: 'perfil' | 'manual',
    originalCategory?: string,
    ligaActive?: boolean,
  }>,
  standbyParticipants?: Array<same shape>,
  waitlist?: Array<same shape>, // legacy alias merged em standbyParticipants

  maxParticipants?: number,

  // Estado de check-in (pré-jogo)
  checkedIn?: { [name: string]: number }, // timestamp ms
  absent?: { [name: string]: number },
  tournamentStarted?: boolean,
  woScope?: 'individual' | 'team',
  woHistory?: { [name: string]: { originalTeam, partner, matchNum, replacedBy?, timestamp } },

  // Categorias
  combinedCategories?: string[],
  genderCategories?: string[],
  skillCategories?: string[],
  categoryNotifications?: any[],
  mergeHistory?: any[],

  // Sistema de pontuação (GSM)
  scoring?: {
    type: 'simple' | 'sets',
    setsToWin?: number,
    gamesPerSet?: number,
    countingType?: 'tennis' | 'numeric',
    advantageRule?: boolean,
    tiebreakEnabled?: boolean,
    tiebreakPoints?: number,
    tiebreakMargin?: number,
    superTiebreak?: boolean,
    superTiebreakPoints?: number,
    fixedSet?: boolean,
  },
  advancedScoring?: {
    enabled: boolean,
    categories: { /* ver bracket-logic.js _calcAdvancedPoints */ }
  },
  tiebreakers?: string[], // ['confronto_direto', 'saldo_pontos', ...]

  // Bracket data (varia por formato)
  matches?: Match[], // eliminatórias
  rounds?: Round[], // Liga / Suíço (cada round tem matches[])
  groups?: Group[], // Grupos+Elim
  rodadas?: any[], // legacy
  thirdPlaceMatch?: Match,
  currentStage?: 'groups' | 'elimination' | 'classification',
  classification?: any,
  standings?: Standing[], // Liga/Suíço

  // Liga-específico
  ligaSeasonMonths?: number,
  ligaOpenEnrollment?: boolean,
  drawFirstDate?: string,
  drawFirstTime?: string,
  drawIntervalDays?: number,
  drawManual?: boolean,
  lastAutoDrawAt?: number,
  sitOutHistory?: { [round: string]: string[] },
  swissStandings?: any,
  swissRoundsData?: any,
  swissEliminated?: string[],

  // Co-host invites
  pendingHostInvites?: Array<{email, type, sentAt}>,

  // Logs e analytics
  history?: Array<{date: string, message: string}>,
  vips?: { [name: string]: boolean },

  // Polls
  polls?: any[],
  activePollId?: string,
  pollNotifications?: any[],

  // Logo gerada
  logoData?: string, // base64 PNG
  logoLocked?: boolean,

  // Flags internas
  _suspendedByPanel?: boolean,
  _finishNotified?: boolean,
  _roundCloseAt?: number,

  // Compat fields (legacy, manter ler/limpar pós-beta)
  drawVisibility?: 'public' | 'private',
  gruposClassified?: number, // 1 ou 2
  combinedCategoriesOriginal?: string[],
  teamOrigins?: any,
}
```

**Sub-coleções:**
- (nenhuma — tudo no doc principal)

---

## 3. `casualMatches/{auto-id}` — Partida Casual

```typescript
{
  _docId?: string, // populado pelo loadCasualMatch
  roomCode: string, // 6 chars, A-Z + 0-9, único por sessão
  status: 'waiting' | 'active' | 'finished' | 'cancelled',

  createdAt: string, // ISO
  createdBy: string, // uid do organizador
  createdByName: string,
  createdByEmail?: string,

  sport: string,
  isDoubles: boolean,
  scoring: { /* mesmo shape de tournament.scoring */ },

  // Participantes (uid-based, não nome)
  participants: Array<{
    uid: string,
    displayName: string,
    photoURL?: string,
    joinedAt: string, // ISO
    team?: 1 | 2,
  }>,
  playerUids: string[], // dedup: array de uids só

  // Players com nomes finais (pós-iniciar)
  players: Array<{
    name: string,
    uid?: string,
    photoURL?: string,
    email?: string,
    team: 1 | 2,
  }>,
  teamsFormed?: boolean,

  // Resultado (set quando status='finished')
  result?: {
    winner: 1 | 2 | 'draw',
    sets?: any[],
    finalScoreP1?: number,
    finalScoreP2?: number,
    duration?: number,
  },
}
```

---

## 4. `presences/{auto-id}` — Check-in / Plano de presença

```typescript
{
  _id?: string, // populado pelo load
  uid: string,
  userName: string,
  userEmail?: string,
  userPhotoURL?: string,

  type: 'checkin' | 'plan',
  placeId: string,
  venueName: string,
  lat?: number,
  lng?: number,

  sports: string[], // múltiplas modalidades possíveis
  visibility: 'public' | 'friends' | 'private',

  startsAt: number, // timestamp ms
  endsAt?: number, // opcional pra checkin (fim do horário previsto)
  dayKey: string, // "YYYY-MM-DD" pra index de queries
  cancelled?: boolean,

  createdAt: number, // timestamp ms
  source?: 'manual' | 'auto-gps' | 'tournament' | 'casual',
}
```

---

## 5. `venues/{key}` — Locais

`key` = placeId Google quando disponível, senão `<lat>_<lng>_<nameSlug>`.

```typescript
{
  // Identidade
  placeId?: string, // Google Places ID quando disponível
  name: string,
  city?: string,
  state?: string,
  country?: string,
  address?: string,
  lat: number,
  lng: number,

  // Descrição
  description?: string,
  priceRange?: 'low' | 'medium' | 'high',
  accessPolicy: 'public' | 'private', // public = acessível à comunidade
  openingHours?: {
    grid: number[], // 168 posições (7 dias × 24 horas), 0 = fechado, 1 = aberto
  },

  // Modalidades
  sports: string[], // sincronizado automaticamente de courts[]
  courts?: Array<{
    name: string,
    sport: string,
    surface?: string,
    indoor?: boolean,
    count?: number,
  }>,
  courtCount?: number, // legacy — se ausente, derivar de courts.reduce(c => c.count)

  // Ownership
  ownerUid?: string, // dono formal (claimou)
  createdByUid: string, // primeiro a cadastrar
  createdAt: number,
  updateHistory?: Array<{uid, userName, timestamp, fields[]}>,

  // Contato
  phone?: string,
  email?: string,
  website?: string,
  instagram?: string,

  // Reviews (sub-coleção: venues/{key}/reviews/{uid})

  // Photos
  photoUrl?: string, // hero photo (Google ou upload)

  // Plan
  plan?: 'free' | 'pro',
  planExpiresAt?: number,
}
```

**Sub-coleções:**
- `venues/{key}/reviews/{uid}` — uma review por usuário

---

## Migrations conhecidas

### Histórico (já aplicado):
1. `friends`: array de emails → array de uids (auto-migrado em `_addProfileLocation` em auth.js)
2. `cu.preferredSports`: string CSV → array (compat lido em `_openCasualMatch`)
3. Liga unification: `format: 'Ranking'` → `format: 'Liga'` (alpha — compat via `_isLigaFormat()`)
4. `t.checkedIn[name]`: boolean → timestamp ms (FIFO substitution)
5. `m.sets[].tiebreak`: nullable → object com pointsP1/P2
6. `openingHours.grid`: array 2D 7×24 → flat 168 (Firestore não aceita arrays aninhados)

### Pendentes (definir antes de beta):
- [ ] Padronizar `t.creatorEmail` ⟷ `t.organizerEmail` (decidir um único, deprecar o outro)
- [ ] Decidir se `t.waitlist` é alias de `t.standbyParticipants` ou existem 2 listas separadas
- [ ] Cleanup de `whatsapp_queue` collection (deprecated desde v0.16)
- [ ] Migrar docs antigos sem `_schemaVersion` field (adicionar v1)

---

## Beta-readiness checklist

- [ ] Adicionar `_schemaVersion: 1` a TODOS os novos docs criados a partir da v0.18
- [ ] Implementar `js/migrations.js` com runner que detecta `_schemaVersion` e roda migrations sequenciais
- [ ] Validador defensivo em `firebase-db.js` que rejeita writes com campos obrigatórios faltando
- [ ] Documentar TODOS os enums (formats, statuses, sports) num arquivo separado pra evitar typos
- [ ] Audit cross-referência: campos lidos em algum lugar que nunca são escritos (dead reads), e vice-versa

---

## Critical writes (operações que NÃO podem perder dados)

| Operação | Path | Mitigação atual |
|---|---|---|
| Criar torneio | `tournaments/{id}` | sync direto + retry no caller |
| Inscrever participante | `tournaments/{id}` | Firestore transaction (atomic) |
| Lançar resultado | `tournaments/{id}` | sync com toast de erro |
| Aprovar resultado pendente | `tournaments/{id}` | auto-approve antes de gerar próxima rodada (v0.17.27) |
| Criar partida casual | `casualMatches/{id}` | save fire-and-forget + sessionStorage backup (v0.17.48) |
| Marcar presença | `presences/{id}` | in-flight registry (dedup race) |

Em **beta**, adicionar:
- [ ] Audit log (sub-coleção `users/{uid}/auditLog/`) pra operações críticas
- [ ] Optimistic UI com rollback em caso de erro Firestore
- [ ] Backups automáticos via Firebase Functions schedule

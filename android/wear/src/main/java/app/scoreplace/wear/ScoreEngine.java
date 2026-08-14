package app.scoreplace.wear;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.TreeMap;

/**
 * MOTOR DE PONTUAÇÃO NATIVO do relógio Wear (Caminho B, Leva 2) — tradução
 * mecânica do ScoreEngine.swift, que por sua vez é transliteração 1:1 do motor
 * GSM do celular (js/views/bracket-ui.js, placar ao vivo).
 *
 * ⚠️ ESTE ARQUIVO NÃO INVENTA REGRA NENHUMA. Quem prova a igualdade são os
 * VETORES DE PARIDADE (tests/watch-engine/vectors/), gerados do motor JS REAL
 * e re-executados aqui por tests/watch-engine/run-java-parity.sh — divergiu,
 * fica vermelho. Mudou o motor JS? Regrave os vetores e rode a paridade de
 * novo (contrato: docs/smartwatch-bridge.md, seção "Caminho B").
 *
 * Java puro (sem dependência de Android) DE PROPÓSITO: o mesmo .java compila
 * no :wear e no runner de paridade com javac seco. Kotlin fica de fora do
 * :wear por decisão antiga (Health Connect só no :app).
 *
 * snapshotCanonical() emite o snapshot já na forma CANÔNICA (chaves ordenadas,
 * escaping de JSON.stringify) — a mesma régua do gen.stable do gerador.
 */
public final class ScoreEngine {

    // ── Config resolvida (espelho do EngineConfig do Swift) ──
    public static final class Config {
        public String type = "sets";
        public int setsToWin = 1;
        public int gamesPerSet = 6;
        public boolean tiebreakEnabled = true;
        public int tiebreakPoints = 7;
        public int tiebreakMargin = 2;
        public boolean superTiebreak = false;
        public int superTiebreakPoints = 10;
        public String countingType = "numeric";
        public boolean advantageRule = false;
        public Boolean deuceRule = null;          // explícito vence o legado advantageRule
        public Boolean twoPointAdvantage = null;  // default ON
        public String tieRule = null;             // casual sem regra → 'ask'
        public boolean fixedSet = false;
        public Integer fixedSetGames = null;
    }

    static final class SetScore {
        int gamesP1, gamesP2;
        Integer tbP1, tbP2;
        SetScore copy() {
            SetScore s = new SetScore();
            s.gamesP1 = gamesP1; s.gamesP2 = gamesP2; s.tbP1 = tbP1; s.tbP2 = tbP2;
            return s;
        }
    }
    static final class ServeSlot {
        final int team; final String name;
        ServeSlot(int team, String name) { this.team = team; this.name = name; }
    }
    static final class State {
        List<SetScore> sets = new ArrayList<>();
        int currentGameP1, currentGameP2;
        boolean isTiebreak, isFinished;
        Integer winner = null;
        String tieRule = null;
        boolean tieRulePending;
        int tiebreakPoints = 7;                    // mutável (regra 'supertiebreak')
        List<ServeSlot> serveOrder = new ArrayList<>();
        boolean serveSkipped, secondServerPicked;
        int totalGamesPlayed;
        State() { sets.add(new SetScore()); }
        State copy() {
            State s = new State();
            s.sets = new ArrayList<>();
            for (SetScore x : sets) s.sets.add(x.copy());
            s.currentGameP1 = currentGameP1; s.currentGameP2 = currentGameP2;
            s.isTiebreak = isTiebreak; s.isFinished = isFinished;
            s.winner = winner; s.tieRule = tieRule; s.tieRulePending = tieRulePending;
            s.tiebreakPoints = tiebreakPoints;
            s.serveOrder = new ArrayList<>(serveOrder);   // slots são imutáveis
            s.serveSkipped = serveSkipped; s.secondServerPicked = secondServerPicked;
            s.totalGamesPlayed = totalGamesPlayed;
            return s;
        }
    }

    // config imutável
    final boolean useSets;
    final int setsToWin, gamesPerSet, tiebreakMargin, superTiebreakPoints, fixedSetGames;
    final boolean tiebreakEnabled, superTiebreak, deuceRule, twoPointAdvantage, isFixedSet;
    final String countingType;

    final List<String> p1Players, p2Players;
    final boolean isDoubles, isCasual;
    final String sportName;

    State state = new State();
    int[] pickerSel = null;                 // {team, idx} — fora do state (undo não restaura)
    final List<State> undoStack = new ArrayList<>();
    int courtLeft = 1;                      // fixSides OFF: o lado esquerdo segue o sacador

    public ScoreEngine(Config cfg, String p1Name, String p2Name,
                       boolean doubles, String sport) {
        List<String> p1 = split(p1Name), p2 = split(p2Name);
        boolean dbl = p1.size() > 1 || p2.size() > 1 || doubles;
        if (dbl) {
            if (p1.isEmpty()) { p1.add("Jogador 1"); p1.add("Jogador 2"); }
            if (p1.size() == 1) p1.add("Jogador 2");
            if (p2.isEmpty()) { p2.add("Jogador 3"); p2.add("Jogador 4"); }
            if (p2.size() == 1) p2.add("Jogador 4");
        } else {
            if (p1.isEmpty()) p1.add("Jogador 1");
            if (p2.isEmpty()) p2.add("Jogador 2");
        }
        p1Players = p1; p2Players = p2;
        isDoubles = dbl; isCasual = true; sportName = sport;

        useSets = "sets".equals(cfg.type);
        setsToWin = useSets ? Math.max(cfg.setsToWin, 1) : 1;
        gamesPerSet = useSets ? Math.max(cfg.gamesPerSet, 1) : 1;
        tiebreakEnabled = useSets && cfg.tiebreakEnabled;
        tiebreakMargin = useSets ? Math.max(cfg.tiebreakMargin, 1) : 2;
        superTiebreak = useSets && cfg.superTiebreak;
        superTiebreakPoints = useSets ? cfg.superTiebreakPoints : 10;
        countingType = useSets ? cfg.countingType : "numeric";
        deuceRule = useSets && (cfg.deuceRule != null ? cfg.deuceRule : cfg.advantageRule);
        twoPointAdvantage = useSets && (cfg.twoPointAdvantage == null || cfg.twoPointAdvantage);
        isFixedSet = useSets && cfg.fixedSet;
        fixedSetGames = isFixedSet ? (cfg.fixedSetGames != null ? cfg.fixedSetGames : cfg.gamesPerSet) : 0;

        state.tiebreakPoints = useSets ? cfg.tiebreakPoints : 7;
        state.tieRule = cfg.tieRule != null ? cfg.tieRule : "ask";   // casual
        render();
    }

    private static List<String> split(String s) {
        List<String> out = new ArrayList<>();
        if (s == null) return out;
        if (s.indexOf('/') > 0) {
            for (String p : s.split("/")) { String t = p.trim(); if (!t.isEmpty()) out.add(t); }
        } else {
            String t = s.trim();
            if (!t.isEmpty()) out.add(t);
        }
        return out;
    }

    // ── eventos do diário ──
    public void point(int team) { addPoint(team); render(); }
    public void undo() { undoLastPoint(); render(); }
    public void serveSelect(int team, int idx) { pickerSel = new int[]{team, idx}; render(); }
    public void serveConfirmEvent() { serveConfirm(); render(); }
    public void resolveTieEvent(String rule) { resolveTie(rule); render(); }

    /** Espelho dos efeitos de estado do _render() do JS (picker + lado do sacador). */
    private void render() {
        syncPicker();
        if (!needsServePick() && !state.tieRulePending && !(state.isFinished && state.winner != null)) {
            ServeSlot srv = currentServer();
            if (srv != null && (srv.team == 1 || srv.team == 2)) courtLeft = srv.team;
        }
    }

    boolean needsServePick() {
        if (state.serveSkipped) return false;
        if (state.isFinished || state.tieRulePending) return false;
        if (state.totalGamesPlayed == 0 && state.serveOrder.isEmpty()) return true;
        return isDoubles && state.totalGamesPlayed == 1 && state.serveOrder.size() >= 2
                && !state.secondServerPicked;
    }

    private List<int[]> pickerPlayers() {
        List<int[]> out = new ArrayList<>();
        if (!needsServePick()) return out;
        if (state.totalGamesPlayed == 0) {
            for (int i = 0; i < p1Players.size(); i++) out.add(new int[]{1, i});
            for (int i = 0; i < p2Players.size(); i++) out.add(new int[]{2, i});
            return out;
        }
        if (state.serveOrder.size() < 2) return out;
        int t = state.serveOrder.get(1).team;
        List<String> ps = t == 1 ? p1Players : p2Players;
        for (int i = 0; i < ps.size(); i++) out.add(new int[]{t, i});
        return out;
    }

    private void syncPicker() {
        List<int[]> players = pickerPlayers();
        if (players.isEmpty()) return;
        if (pickerSel != null) {
            for (int[] p : players) if (p[0] == pickerSel[0] && p[1] == pickerSel[1]) return;
        }
        pickerSel = players.get(0);
    }

    private void serveConfirm() {
        if (pickerSel == null) return;
        int selTeam = pickerSel[0], selIdx = pickerSel[1];
        if (!isDoubles) {
            int otherTeam = selTeam == 1 ? 2 : 1;
            List<String> mine = selTeam == 1 ? p1Players : p2Players;
            String srvName = selIdx < mine.size() ? mine.get(selIdx) : "";
            List<String> others = otherTeam == 1 ? p1Players : p2Players;
            state.serveOrder = new ArrayList<>();
            state.serveOrder.add(new ServeSlot(selTeam, srvName));
            state.serveOrder.add(new ServeSlot(otherTeam, others.isEmpty() ? "" : others.get(0)));
            state.secondServerPicked = true;
            return;
        }
        if (state.totalGamesPlayed == 1) state.secondServerPicked = true;
        setServer(selTeam, selIdx);
    }

    private void setServer(int team, int playerIdx) {
        if (state.totalGamesPlayed >= 2) return;   // HARD LOCK
        List<String> players = team == 1 ? p1Players : p2Players;
        if (playerIdx >= players.size()) return;
        String name = players.get(playerIdx);
        if (state.totalGamesPlayed == 0) {
            String teammate = null;
            for (String p : players) if (!p.equals(name)) { teammate = p; break; }
            int otherTeam = team == 1 ? 2 : 1;
            List<String> opponents = otherTeam == 1 ? p1Players : p2Players;
            state.serveOrder = new ArrayList<>();
            state.serveOrder.add(new ServeSlot(team, name));
            state.serveOrder.add(new ServeSlot(otherTeam,
                    opponents.size() > 0 ? opponents.get(0) : "Jogador " + (otherTeam == 1 ? 1 : 3)));
            state.serveOrder.add(new ServeSlot(team,
                    teammate != null ? teammate : "Jogador " + (team == 1 ? 2 : 4)));
            state.serveOrder.add(new ServeSlot(otherTeam,
                    opponents.size() > 1 ? opponents.get(1) : "Jogador " + (otherTeam == 1 ? 2 : 4)));
        } else if (state.totalGamesPlayed == 1) {
            if (state.serveOrder.size() < 4 || state.serveOrder.get(1).team != team) return;
            String other = null;
            for (String p : players) if (!p.equals(name)) { other = p; break; }
            state.serveOrder.set(1, new ServeSlot(team, name));
            state.serveOrder.set(3, new ServeSlot(team,
                    other != null ? other : state.serveOrder.get(3).name));
        }
    }

    private void resolveTie(String rule) {
        if (!"extend".equals(rule) && !"tiebreak".equals(rule)) return;
        state.tieRulePending = false;
        if ("tiebreak".equals(rule)) {
            state.tieRule = "tiebreak";
            state.isTiebreak = true;
            state.currentGameP1 = 0;
            state.currentGameP2 = 0;
        }
        // 'extend' NÃO fixa a regra: mantém 'ask' pra reperguntar no próximo empate
    }

    boolean isDecidingSet() { return superTiebreak && state.sets.size() == setsToWin * 2 - 1; }

    int setsWon(int player, boolean includeAll) {
        int count = 0;
        int limit = includeAll ? state.sets.size() : state.sets.size() - 1;
        for (int i = 0; i < Math.max(limit, 0); i++) {
            SetScore s = state.sets.get(i);
            if (player == 1 && s.gamesP1 > s.gamesP2) count++;
            if (player == 2 && s.gamesP2 > s.gamesP1) count++;
        }
        return count;
    }

    String formatGamePoint(int pts, int oppPts, boolean isTb) {
        if (isTb) return String.valueOf(pts);
        if ("tennis".equals(countingType) && !isFixedSet) {
            if (pts >= 3 && oppPts >= 3) {
                if (deuceRule) {
                    if (pts == oppPts) return "40";
                    return pts > oppPts ? "AD" : "40";
                }
                return "40";
            }
            int[] map = {0, 15, 30, 40};
            return String.valueOf(pts < 4 ? map[pts] : 40);
        }
        return String.valueOf(pts);
    }

    private int checkGameWon() {
        int p1 = state.currentGameP1, p2 = state.currentGameP2;
        if (state.isTiebreak || isDecidingSet()) {
            int tbPts = isDecidingSet() ? superTiebreakPoints : state.tiebreakPoints;
            if (p1 >= tbPts && p1 - p2 >= tiebreakMargin) return 1;
            if (p2 >= tbPts && p2 - p1 >= tiebreakMargin) return 2;
            return 0;
        }
        if (isFixedSet) {
            if (p1 + p2 >= fixedSetGames) return p1 > p2 ? 1 : (p2 > p1 ? 2 : 0);
            return 0;
        }
        if ("tennis".equals(countingType)) {
            if (!deuceRule) {
                if (p1 >= 4) return 1;
                if (p2 >= 4) return 2;
                return 0;
            }
            if (p1 >= 4 && p1 - p2 >= 2) return 1;
            if (p2 >= 4 && p2 - p1 >= 2) return 2;
            return 0;
        }
        if (p1 > p2) return 1;
        if (p2 > p1) return 2;
        return 0;
    }

    // 1/2 vencedor · 0 nada · -1 entrou em tiebreak · -2 pausado esperando decisão
    private int checkSetWon() {
        SetScore cs = state.sets.get(state.sets.size() - 1);
        int g = gamesPerSet;
        if (isFixedSet) return 0;
        if (isDecidingSet()) return 0;
        if (!twoPointAdvantage) {
            if (cs.gamesP1 >= g) return 1;
            if (cs.gamesP2 >= g) return 2;
            return 0;
        }
        String rule = state.tieRule;
        if (rule != null && cs.gamesP1 == cs.gamesP2 && cs.gamesP1 >= g - 1) {
            if ("ask".equals(rule) && !state.tieRulePending) {
                state.tieRulePending = true;
                return -2;
            }
            if ("tiebreak".equals(rule)) {
                state.isTiebreak = true;
                state.currentGameP1 = 0;
                state.currentGameP2 = 0;
                return -1;
            }
            if ("supertiebreak".equals(rule)) {
                state.isTiebreak = true;
                state.tiebreakPoints = superTiebreakPoints;
                state.currentGameP1 = 0;
                state.currentGameP2 = 0;
                return -1;
            }
            // "extend": segue pro check padrão de 2 de vantagem
        }
        if ("extend".equals(state.tieRule)) {
            if (cs.gamesP1 >= g && cs.gamesP1 - cs.gamesP2 >= 2) return 1;
            if (cs.gamesP2 >= g && cs.gamesP2 - cs.gamesP1 >= 2) return 2;
            return 0;
        }
        if (cs.gamesP1 >= g && cs.gamesP1 - cs.gamesP2 >= 2) return 1;
        if (cs.gamesP2 >= g && cs.gamesP2 - cs.gamesP1 >= 2) return 2;
        if (tiebreakEnabled && cs.gamesP1 == g - 1 && cs.gamesP2 == g - 1) {
            state.isTiebreak = true;
            state.currentGameP1 = 0;
            state.currentGameP2 = 0;
            return -1;
        }
        return 0;
    }

    private void finishSet(int setWinner) {
        state.currentGameP1 = 0;
        state.currentGameP2 = 0;
        state.isTiebreak = false;
        int matchWinner = 0;
        if (setsWon(1, true) >= setsToWin) matchWinner = 1;
        else if (setsWon(2, true) >= setsToWin) matchWinner = 2;
        if (matchWinner > 0 || (!useSets && isFixedSet)) {
            if (isFixedSet) matchWinner = setWinner;
            state.isFinished = true;
            state.winner = matchWinner;
        } else {
            state.sets.add(new SetScore());
        }
    }

    private void addPoint(int player) {
        if (state.isFinished) return;
        if (state.tieRulePending) return;
        if (needsServePick()) return;   // render() do chamador reabre o picker

        undoStack.add(state.copy());
        if (undoStack.size() > 30) undoStack.remove(0);

        if (player == 1) state.currentGameP1++; else state.currentGameP2++;

        if (!useSets || isFixedSet) {
            if (isFixedSet) {
                SetScore cs = state.sets.get(state.sets.size() - 1);
                if (player == 1) cs.gamesP1 = state.currentGameP1;
                else cs.gamesP2 = state.currentGameP2;
                if (state.currentGameP1 + state.currentGameP2 >= fixedSetGames) {
                    if (state.currentGameP1 == state.currentGameP2 && tiebreakEnabled) {
                        state.isTiebreak = true;
                        state.currentGameP1 = 0;
                        state.currentGameP2 = 0;
                    } else {
                        finishSet(state.currentGameP1 > state.currentGameP2 ? 1 : 2);
                    }
                }
            }
            return;
        }

        int gameWinner = checkGameWon();
        if (gameWinner > 0) {
            SetScore cs = state.sets.get(state.sets.size() - 1);
            if (state.isTiebreak) {
                cs.tbP1 = state.currentGameP1;
                cs.tbP2 = state.currentGameP2;
                if (gameWinner == 1) cs.gamesP1++; else cs.gamesP2++;
                state.isTiebreak = false;
                finishSet(gameWinner);
            } else if (isDecidingSet()) {
                cs.tbP1 = state.currentGameP1;
                cs.tbP2 = state.currentGameP2;
                if (gameWinner == 1) cs.gamesP1++; else cs.gamesP2++;
                finishSet(gameWinner);
            } else {
                if (gameWinner == 1) cs.gamesP1++; else cs.gamesP2++;
                state.currentGameP1 = 0;
                state.currentGameP2 = 0;
                state.totalGamesPlayed++;
                int setResult = checkSetWon();
                if (setResult > 0) finishSet(setResult);
            }
        }
    }

    private void undoLastPoint() {
        if (state.tieRulePending) return;
        if (undoStack.isEmpty()) return;
        state = undoStack.remove(undoStack.size() - 1);   // atravessa game/set/FIM
    }

    ServeSlot currentServer() {
        if (state.serveSkipped || state.serveOrder.isEmpty()) return null;
        int idx;
        if (state.isTiebreak || isDecidingSet()) {
            int totalPts = state.currentGameP1 + state.currentGameP2;
            int tbOffset = totalPts == 0 ? 0 : (totalPts + 1) / 2;
            idx = (state.totalGamesPlayed + tbOffset) % state.serveOrder.size();
        } else {
            idx = state.totalGamesPlayed % state.serveOrder.size();
        }
        return idx < state.serveOrder.size() ? state.serveOrder.get(idx) : null;
    }

    private List<int[]> serveEligibleNow() {
        List<int[]> out = new ArrayList<>();
        if (state.serveSkipped || !isDoubles || state.isFinished) return out;
        if (state.totalGamesPlayed >= 2) return out;
        if (state.totalGamesPlayed == 0) {
            for (int i = 0; i < p1Players.size(); i++)
                if (!p1Players.get(i).isEmpty()) out.add(new int[]{1, i});
            for (int i = 0; i < p2Players.size(); i++)
                if (!p2Players.get(i).isEmpty()) out.add(new int[]{2, i});
            return out;
        }
        if (state.serveOrder.size() < 4) return out;
        int t = state.serveOrder.get(1).team;
        List<String> ps = t == 1 ? p1Players : p2Players;
        for (int i = 0; i < ps.size(); i++)
            if (!ps.get(i).isEmpty()) out.add(new int[]{t, i});
        return out;
    }

    // ── _watchShortNames (bracket-ui.js:8401) ──
    static Map<String, String> watchShortNames(List<String> names) {
        Map<String, String> map = new HashMap<>();
        Map<String, Integer> firstCount = new HashMap<>();
        for (String n : names) {
            String f = first(n).toLowerCase(Locale.ROOT);
            if (!f.isEmpty()) firstCount.merge(f, 1, Integer::sum);
        }
        for (String n : names) {
            if (map.containsKey(n)) continue;
            String f = first(n);
            Integer c = firstCount.get(f.toLowerCase(Locale.ROOT));
            if (c != null && c > 1) {
                String li = lastIni(n);
                map.put(n, li.isEmpty() ? f : f + " " + li);
            } else {
                map.put(n, f);
            }
        }
        Map<String, Integer> shortCount = new HashMap<>();
        for (String v : map.values()) shortCount.merge(v.toLowerCase(Locale.ROOT), 1, Integer::sum);
        for (Map.Entry<String, String> e : new ArrayList<>(map.entrySet())) {
            Integer c = shortCount.get(e.getValue().toLowerCase(Locale.ROOT));
            if (c != null && c > 1) map.put(e.getKey(), e.getKey());
        }
        return map;
    }
    private static String first(String n) {
        String[] parts = n == null ? new String[0] : n.trim().split("\\s+");
        return parts.length > 0 && !parts[0].isEmpty() ? parts[0] : (n == null ? "" : n);
    }
    private static String lastIni(String n) {
        String[] parts = n == null ? new String[0] : n.trim().split("\\s+");
        if (parts.length <= 1 || parts[parts.length - 1].isEmpty()) return "";
        return parts[parts.length - 1].substring(0, 1).toUpperCase(Locale.ROOT);
    }

    // ── snapshot CANÔNICO (== _getLiveScoreState canonizado pelo gen.stable) ──
    // Emitido direto na forma ordenada — sem lib de JSON no :wear.
    public String snapshotCanonical() {
        SetScore cs = state.sets.get(state.sets.size() - 1);
        ServeSlot srv = currentServer();
        List<String> all = new ArrayList<>(p1Players);
        all.addAll(p2Players);
        Map<String, String> wnMap = watchShortNames(all);

        String spCurRaw = "";
        if (needsServePick() && pickerSel != null) {
            List<String> arr = pickerSel[0] == 1 ? p1Players : p2Players;
            if (pickerSel[1] < arr.size()) spCurRaw = arr.get(pickerSel[1]);
        }
        if (spCurRaw.isEmpty() && state.totalGamesPlayed < state.serveOrder.size()) {
            spCurRaw = state.serveOrder.get(state.totalGamesPlayed).name;
        }

        List<int[]> elig = serveEligibleNow();

        // TreeMap = chaves ordenadas (a régua do canônico)
        TreeMap<String, String> m = new TreeMap<>();
        m.put("v", "1");
        m.put("type", str("state"));
        m.put("active", bool(!state.isFinished));
        m.put("setLabel", str("Set " + state.sets.size()));
        m.put("points", "[" + str(formatGamePoint(state.currentGameP1, state.currentGameP2, state.isTiebreak))
                + "," + str(formatGamePoint(state.currentGameP2, state.currentGameP1, state.isTiebreak)) + "]");
        m.put("games", "[" + cs.gamesP1 + "," + cs.gamesP2 + "]");
        m.put("isTiebreak", bool(state.isTiebreak));
        m.put("courtLeft", String.valueOf(courtLeft));
        m.put("server", srv == null ? "null"
                : "{" + str("name") + ":" + str(wn(wnMap, srv.name)) + "," + str("team") + ":" + srv.team + "}");
        m.put("teams", "{" + str("1") + ":{" + str("players") + ":" + nameArr(p1Players, wnMap) + "},"
                + str("2") + ":{" + str("players") + ":" + nameArr(p2Players, wnMap) + "}}");
        m.put("sets", "[" + setsWon(1, state.isFinished) + "," + setsWon(2, state.isFinished) + "]");
        m.put("setsToWin", String.valueOf(setsToWin));
        m.put("canReplay", bool(isCasual));
        m.put("isCasual", bool(isCasual));
        m.put("sportName", str(sportName));
        m.put("reiRainha", bool(false));
        m.put("rrRound", "0");
        m.put("rrStandings", "[]");
        m.put("isDoubles", bool(isDoubles));
        m.put("rrSuggest", bool(false));
        m.put("canSetServer", bool(!elig.isEmpty()));
        StringBuilder eb = new StringBuilder("[");
        for (int i = 0; i < elig.size(); i++) {
            int[] e = elig.get(i);
            String nm = (e[0] == 1 ? p1Players : p2Players).get(e[1]);
            if (i > 0) eb.append(",");
            eb.append("{").append(str("name")).append(":").append(str(wn(wnMap, nm)))
              .append(",").append(str("playerIdx")).append(":").append(e[1])
              .append(",").append(str("team")).append(":").append(e[0]).append("}");
        }
        eb.append("]");
        m.put("serveEligible", eb.toString());
        m.put("servePickPhase", String.valueOf(!elig.isEmpty() ? state.totalGamesPlayed : -1));
        m.put("servePickOpen", bool(needsServePick()));
        m.put("servePickCurrent", str(wn(wnMap, spCurRaw)));
        m.put("isFinished", bool(state.isFinished));
        m.put("winner", state.winner == null ? "null" : String.valueOf(state.winner));
        m.put("tieRulePending", bool(state.tieRulePending));
        m.put("tiedAt", state.tieRulePending ? String.valueOf(cs.gamesP1) : "null");

        StringBuilder out = new StringBuilder("{");
        boolean firstEntry = true;
        for (Map.Entry<String, String> e : m.entrySet()) {
            if (!firstEntry) out.append(",");
            firstEntry = false;
            out.append(str(e.getKey())).append(":").append(e.getValue());
        }
        return out.append("}").toString();
    }

    private static String wn(Map<String, String> map, String n) {
        String m = map.get(n);
        if (m != null) return m;
        String f = first(n == null ? "" : n);
        return f.isEmpty() ? (n == null ? "" : n) : f;
    }
    private static String nameArr(List<String> names, Map<String, String> wnMap) {
        StringBuilder b = new StringBuilder("[");
        for (int i = 0; i < names.size(); i++) {
            if (i > 0) b.append(",");
            b.append(str(wn(wnMap, names.get(i))));
        }
        return b.append("]").toString();
    }
    private static String bool(boolean b) { return b ? "true" : "false"; }
    private static String str(String s) {
        StringBuilder b = new StringBuilder("\"");
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"': b.append("\\\""); break;
                case '\\': b.append("\\\\"); break;
                case '\n': b.append("\\n"); break;
                case '\r': b.append("\\r"); break;
                case '\t': b.append("\\t"); break;
                default:
                    if (c < 0x20) b.append(String.format("\\u%04x", (int) c));
                    else b.append(c);
            }
        }
        return b.append("\"").toString();
    }
}

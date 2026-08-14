package app.scoreplace.wear;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * POSSE + DIÁRIO do relógio Wear (Caminho B, fiação — docs/smartwatch-bridge.md).
 * Espelho 1:1 do ios/WatchApp/Sources/WatchMatchSession.swift — as MESMAS 5
 * regras, provadas lá por tests/watch-engine/run-swift-session.sh e aqui por
 * run-java-session.sh. Duas implementações da mesma decisão divergem na primeira
 * mudança: por isso os dois runners exercitam a mesma bateria de casos.
 *
 * Responde a UMA pergunta a cada instante: **a tela desenha o motor LOCAL ou o
 * espelho do celular?** — e acumula o diário enquanto o celular não está
 * ouvindo (bolso, tela apagada, JS suspenso: a causa do incidente de 13/ago).
 *
 * REGRAS, e o porquê:
 * 1. Sem `matchEpoch`/`scoring` no snapshot → motor local DESLIGADO (celular com
 *    app antigo). Comportamento = o de hoje (espelho), nunca pior.
 * 2. O motor só arma no COMEÇO da partida (0-0). Semear a partir de um snapshot
 *    seria superfície nova, fora dos vetores de paridade = drift sem rede. Quem
 *    chega no meio da partida espelha até a próxima.
 * 3. Tocou no relógio → posse do relógio: resposta imediata, evento no diário.
 * 4. Snapshot do celular que NÃO bate com o motor local (e ele já teve chance de
 *    aplicar o diário) → DESARMA e volta a espelhar. Nunca mostrar placar local
 *    errado; no pior caso degrada pro comportamento conhecido.
 * 5. O diário só é limpo por partida NOVA (época). Reenviar é idempotente (o
 *    celular deduplica por `deviceId#n`) e é o que garante a entrega.
 *
 * Java puro (org.json é do Android, mas sem Context/View) — roda no runner de
 * teste com javac seco, igual ao ScoreEngine.
 */
public final class WearMatchSession {

    public static final int OWNER_PHONE = 0;
    public static final int OWNER_WATCH = 1;

    private int owner = OWNER_PHONE;
    private ScoreEngine engine = null;
    private final JSONArray journal = new JSONArray();
    private JSONObject mirrored = new JSONObject();
    private String epoch = "";
    private int nextN = 1;
    private int seqAtLastLocalEvent = 0;
    /** Relógio injetável — o runner usa um fixo pra o diário ficar determinístico. */
    public long nowMs = -1;

    public int owner() { return owner; }
    public boolean hasEngine() { return engine != null; }
    public JSONArray journal() { return journal; }

    /** O que a TELA desenha agora. */
    public JSONObject displayState() {
        if (owner == OWNER_WATCH && engine != null) {
            JSONObject local = localSnapshot();
            if (local != null) return local;
        }
        return mirrored;
    }

    /** Diário pendente pro celular (`evlog`); null quando não há o que mandar. */
    public JSONObject pendingEvlog(String deviceId) {
        if (journal.length() == 0 || epoch.isEmpty()) return null;
        try {
            JSONObject o = new JSONObject();
            o.put("v", 1);
            o.put("type", "evlog");
            o.put("deviceId", deviceId);
            o.put("matchEpoch", epoch);
            o.put("events", journal);
            return o;
        } catch (Exception e) { return null; }
    }

    // ── entrada: snapshot do celular ──
    public void ingest(JSONObject s) {
        if (s == null) return;
        String ep = s.optString("matchEpoch", "");
        if (!ep.equals(epoch)) {                 // partida NOVA (ou primeira)
            epoch = ep;
            while (journal.length() > 0) journal.remove(journal.length() - 1);
            nextN = 1;
            owner = OWNER_PHONE;
            engine = armIfAtStart(s);
            mirrored = s;
            return;
        }
        mirrored = s;
        if (owner == OWNER_WATCH && engine != null) {
            JSONObject mine = localSnapshot();
            if (mine != null && !sameScore(mine, s)) {
                // Divergiu — mas só desarma se o celular JÁ teve chance de
                // aplicar o diário; antes disso divergir é o ESPERADO.
                if (journal.length() == 0 || s.optInt("seq", 0) > seqAtLastLocalEvent) {
                    engine = null;
                    owner = OWNER_PHONE;
                }
            } else {
                owner = OWNER_PHONE;             // convergiu: o celular manda de novo
            }
        }
    }

    // ── entrada: toque no relógio ──
    /** @return false quando não há motor armado (o chamador manda o intent unitário). */
    public boolean localEvent(String kind, int team, int playerIdx, String rule) {
        if (engine == null) return false;
        if ("point".equals(kind)) engine.point(team);
        else if ("undo".equals(kind)) engine.undo();
        else if ("serveSelect".equals(kind)) engine.serveSelect(team, playerIdx);
        else if ("serveConfirm".equals(kind)) engine.serveConfirmEvent();
        else if ("resolveTie".equals(kind)) engine.resolveTieEvent(rule);
        else return false;
        try {
            JSONObject e = new JSONObject();
            e.put("n", nextN);
            e.put("t", nowMs >= 0 ? nowMs : System.currentTimeMillis());
            e.put("kind", kind);
            if (team == 1 || team == 2) e.put("team", team);
            if (playerIdx >= 0) e.put("playerIdx", playerIdx);
            if (rule != null) e.put("rule", rule);
            journal.put(e);
        } catch (Exception ignored) { }
        nextN++;
        owner = OWNER_WATCH;
        seqAtLastLocalEvent = mirrored.optInt("seq", 0);
        return true;
    }

    // ── auxiliares ──

    /** Snapshot do motor + os campos que só o espelho conhece (época, ♥, seq). */
    private JSONObject localSnapshot() {
        try {
            JSONObject o = new JSONObject(engine.snapshotCanonical());
            o.put("matchEpoch", mirrored.optString("matchEpoch", ""));
            o.put("hrMax", mirrored.optInt("hrMax", 0));
            o.put("seq", mirrored.optInt("seq", 0));
            o.put("epoch", mirrored.optString("epoch", ""));
            // ⚠️ CONHECIMENTO QUE E' DO CELULAR, NAO DO MOTOR (v1.8.71). O motor
            // local sabe o PLACAR desta partida; ele nao tem como saber o que
            // aconteceu nas partidas ANTERIORES da sessao — e e' disso que sai a
            // serie Rei/Rainha (2 pares distintos entre os mesmos 4 ⇒ sugere o
            // 3º). Sem repassar, o toggle "👑 Rei/Rainha" SUMIA da tela de fim
            // assim que a posse era do relogio. `canReplay` idem (no celular e'
            // `isCasual && !reiRainhaMode`). Espelha o WatchMatchSession.swift.
            o.put("rrSuggest", mirrored.optBoolean("rrSuggest", false));
            o.put("reiRainha", mirrored.optBoolean("reiRainha", false));
            o.put("rrRound", mirrored.optInt("rrRound", 0));
            if (mirrored.optJSONArray("rrStandings") != null) {
                o.put("rrStandings", mirrored.optJSONArray("rrStandings"));
            }
            o.put("canReplay", mirrored.optBoolean("canReplay", o.optBoolean("canReplay", false)));
            return o;
        } catch (Exception e) { return null; }
    }

    /** Arma o motor SÓ quando o snapshot é o começo da partida (regra 2). */
    private static ScoreEngine armIfAtStart(JSONObject s) {
        if (!s.optBoolean("active", false) || s.optBoolean("isFinished", false)) return null;
        if (s.optString("matchEpoch", "").isEmpty()) return null;
        JSONObject sc = s.optJSONObject("scoring");
        if (sc == null) return null;
        JSONArray g = s.optJSONArray("games"), st = s.optJSONArray("sets"), pts = s.optJSONArray("points");
        if (g == null || st == null || pts == null) return null;
        boolean zeroed = g.optInt(0, -1) == 0 && g.optInt(1, -1) == 0
                && st.optInt(0, -1) == 0 && st.optInt(1, -1) == 0
                && "0".equals(pts.optString(0, "")) && "0".equals(pts.optString(1, ""));
        if (!zeroed) return null;

        ScoreEngine.Config cfg = new ScoreEngine.Config();
        cfg.type = sc.optString("type", "sets");
        cfg.setsToWin = sc.optInt("setsToWin", 1);
        cfg.gamesPerSet = sc.optInt("gamesPerSet", 6);
        cfg.tiebreakEnabled = sc.optBoolean("tiebreakEnabled", true);
        cfg.tiebreakPoints = sc.optInt("tiebreakPoints", 7);
        cfg.tiebreakMargin = sc.optInt("tiebreakMargin", 2);
        cfg.superTiebreak = sc.optBoolean("superTiebreak", false);
        cfg.superTiebreakPoints = sc.optInt("superTiebreakPoints", 10);
        cfg.countingType = sc.optString("countingType", "numeric");
        cfg.deuceRule = sc.optBoolean("deuceRule", false);
        cfg.twoPointAdvantage = sc.optBoolean("twoPointAdvantage", true);
        cfg.tieRule = sc.isNull("tieRule") ? null : sc.optString("tieRule", null);
        cfg.fixedSet = sc.optBoolean("fixedSet", false);
        cfg.fixedSetGames = sc.optInt("fixedSetGames", 0);

        String p1 = joinPlayers(s, "1"), p2 = joinPlayers(s, "2");
        if (p1.isEmpty() || p2.isEmpty()) return null;
        return new ScoreEngine(cfg, p1, p2, s.optBoolean("isDoubles", false),
                s.optString("sportName", ""));
    }

    private static String joinPlayers(JSONObject s, String team) {
        JSONObject teams = s.optJSONObject("teams");
        if (teams == null) return "";
        JSONObject t = teams.optJSONObject(team);
        if (t == null) return "";
        JSONArray ps = t.optJSONArray("players");
        if (ps == null) return "";
        StringBuilder b = new StringBuilder();
        for (int i = 0; i < ps.length(); i++) {
            if (i > 0) b.append("/");
            b.append(ps.optString(i, ""));
        }
        return b.toString();
    }

    /** Igualdade de PLACAR (seq/época/♥ mudam sem que o jogo tenha mudado). */
    static boolean sameScore(JSONObject a, JSONObject b) {
        if (!arrEq(a.optJSONArray("points"), b.optJSONArray("points"))) return false;
        if (!arrEq(a.optJSONArray("games"), b.optJSONArray("games"))) return false;
        if (!arrEq(a.optJSONArray("sets"), b.optJSONArray("sets"))) return false;
        if (a.optBoolean("isTiebreak") != b.optBoolean("isTiebreak")) return false;
        if (a.optBoolean("isFinished") != b.optBoolean("isFinished")) return false;
        if (a.optInt("winner", -1) != b.optInt("winner", -1)) return false;
        if (a.optBoolean("tieRulePending") != b.optBoolean("tieRulePending")) return false;
        if (a.optBoolean("servePickOpen") != b.optBoolean("servePickOpen")) return false;
        if (a.optInt("courtLeft", 1) != b.optInt("courtLeft", 1)) return false;
        JSONObject sa = a.optJSONObject("server"), sb = b.optJSONObject("server");
        if ((sa == null) != (sb == null)) return false;
        if (sa != null && (sa.optInt("team", 0) != sb.optInt("team", 0)
                || !sa.optString("name", "").equals(sb.optString("name", "")))) return false;
        return true;
    }

    private static boolean arrEq(JSONArray a, JSONArray b) {
        if (a == null || b == null) return a == b;
        if (a.length() != b.length()) return false;
        for (int i = 0; i < a.length(); i++) {
            if (!String.valueOf(a.opt(i)).equals(String.valueOf(b.opt(i)))) return false;
        }
        return true;
    }
}

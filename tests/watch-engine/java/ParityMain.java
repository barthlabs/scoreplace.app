import app.scoreplace.wear.ScoreEngine;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;

/**
 * Runner de PARIDADE do motor Java do Wear (Caminho B, Leva 2).
 * Java puro não tem parser de JSON — quem lê os vetores e compara é o driver
 * Node (tests/watch-engine/run-java-parity.js). Este main fala um protocolo de
 * LINHAS via stdin e responde cada evento com o snapshot CANÔNICO numa linha:
 *
 *   VECTOR <nome>          (reseta; começa um vetor novo)
 *   P1 <nomes>             (ex.: Ana/Bruno)
 *   P2 <nomes>
 *   DOUBLES 0|1
 *   SPORT <modalidade>
 *   CFG <chave> <valor>    (uma por chave presente no config do vetor)
 *   OPEN                   → imprime o snapshot inicial
 *   EV point <team>        → imprime o snapshot pós-evento
 *   EV undo
 *   EV serveSelect <team> <idx>
 *   EV serveConfirm
 *   EV resolveTie <rule>
 */
public final class ParityMain {
    public static void main(String[] args) throws Exception {
        BufferedReader in = new BufferedReader(new InputStreamReader(System.in, StandardCharsets.UTF_8));
        ScoreEngine.Config cfg = null;
        String p1 = "", p2 = "", sport = "";
        boolean doubles = false;
        ScoreEngine engine = null;
        String line;
        while ((line = in.readLine()) != null) {
            line = line.trim();
            if (line.isEmpty()) continue;
            String[] tok = line.split(" ", 2);
            String cmd = tok[0];
            String rest = tok.length > 1 ? tok[1] : "";
            switch (cmd) {
                case "VECTOR":
                    cfg = new ScoreEngine.Config();
                    p1 = ""; p2 = ""; sport = ""; doubles = false; engine = null;
                    break;
                case "P1": p1 = rest; break;
                case "P2": p2 = rest; break;
                case "SPORT": sport = rest; break;
                case "DOUBLES": doubles = "1".equals(rest); break;
                case "CFG": {
                    String[] kv = rest.split(" ", 2);
                    String k = kv[0], v = kv.length > 1 ? kv[1] : "";
                    switch (k) {
                        case "type": cfg.type = v; break;
                        case "setsToWin": cfg.setsToWin = Integer.parseInt(v); break;
                        case "gamesPerSet": cfg.gamesPerSet = Integer.parseInt(v); break;
                        case "tiebreakEnabled": cfg.tiebreakEnabled = Boolean.parseBoolean(v); break;
                        case "tiebreakPoints": cfg.tiebreakPoints = Integer.parseInt(v); break;
                        case "tiebreakMargin": cfg.tiebreakMargin = Integer.parseInt(v); break;
                        case "superTiebreak": cfg.superTiebreak = Boolean.parseBoolean(v); break;
                        case "superTiebreakPoints": cfg.superTiebreakPoints = Integer.parseInt(v); break;
                        case "countingType": cfg.countingType = v; break;
                        case "advantageRule": cfg.advantageRule = Boolean.parseBoolean(v); break;
                        case "deuceRule": cfg.deuceRule = Boolean.parseBoolean(v); break;
                        case "twoPointAdvantage": cfg.twoPointAdvantage = Boolean.parseBoolean(v); break;
                        case "tieRule": cfg.tieRule = v; break;
                        case "fixedSet": cfg.fixedSet = Boolean.parseBoolean(v); break;
                        case "fixedSetGames": cfg.fixedSetGames = Integer.parseInt(v); break;
                        default: throw new IllegalArgumentException("CFG desconhecida: " + k);
                    }
                    break;
                }
                case "OPEN":
                    engine = new ScoreEngine(cfg, p1, p2, doubles, sport);
                    System.out.println(engine.snapshotCanonical());
                    break;
                case "EV": {
                    String[] ev = rest.split(" ");
                    switch (ev[0]) {
                        case "point": engine.point(Integer.parseInt(ev[1])); break;
                        case "undo": engine.undo(); break;
                        case "serveSelect":
                            engine.serveSelect(Integer.parseInt(ev[1]), Integer.parseInt(ev[2])); break;
                        case "serveConfirm": engine.serveConfirmEvent(); break;
                        case "resolveTie": engine.resolveTieEvent(ev[1]); break;
                        default: throw new IllegalArgumentException("evento desconhecido: " + ev[0]);
                    }
                    System.out.println(engine.snapshotCanonical());
                    break;
                }
                default:
                    throw new IllegalArgumentException("comando desconhecido: " + cmd);
            }
        }
        System.out.flush();
    }
}

package app.scoreplace

import android.content.Context
import android.util.Log
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant
import java.time.ZoneId

/**
 * Grava no Health Connect o treino medido pelo RELÓGIO durante a partida.
 *
 * POR QUE AQUI (celular) E NÃO NO RELÓGIO: o Health Connect é plataforma de
 * celular — não existe no Wear OS. O relógio mede o BPM e manda o resumo pela
 * ponte (`/scoreplace/workout`, ver wear/MainActivity.finishWorkoutAndSend);
 * quem grava é este lado. Assim o esforço CONTA nos exercícios e na atividade
 * diária, em paridade com o Apple (HKWorkoutSession + finishWorkout no
 * ios/App/Watch/HeartRate.swift).
 *
 * NUNCA DERRUBA O APP: sem Health Connect instalado, sem permissão ou com erro,
 * o treino é guardado em SharedPreferences e regravado na próxima oportunidade.
 */
object WorkoutRecorder {

    private const val TAG = "spWorkout"
    private const val PREFS = "scoreplace_workouts"
    private const val KEY_PENDING = "pending"
    private const val KEY_ASKED_AT = "askedAt"
    /** Só pede permissão de novo depois de uma semana. */
    private const val ASK_COOLDOWN_MS = 7L * 24 * 60 * 60 * 1000
    private const val MAX_PENDING = 20

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Permissões mínimas: escrever a sessão de exercício e os batimentos dela. */
    @JvmStatic
    val permissions: Set<String> = setOf(
        HealthPermission.getWritePermission(ExerciseSessionRecord::class),
        HealthPermission.getWritePermission(HeartRateRecord::class),
    )

    /** Health Connect disponível neste aparelho? */
    @JvmStatic
    fun isAvailable(context: Context): Boolean =
        try { HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE }
        catch (t: Throwable) { false }

    /**
     * Recebe o JSON do relógio. Se der pra gravar agora, grava; senão enfileira.
     * Chamável do Java (ScoreplaceWatchPlugin) — retorna na hora, grava em background.
     */
    @JvmStatic
    fun onWorkoutJson(context: Context, json: String) {
        val app = context.applicationContext
        enqueue(app, json)
        flushPending(app)
    }

    /**
     * Se existe treino esperando e falta permissão, abre o pedido — mas SÓ com o app
     * em primeiro plano (Android bloqueia abrir tela do background) e no máximo uma
     * vez por semana, pra não virar chateação. Chamado no load do plugin, quando o
     * usuário acabou de abrir o app depois de jogar.
     */
    @JvmStatic
    fun promptIfNeeded(activity: android.app.Activity) {
        val app = activity.applicationContext
        scope.launch {
            try {
                if (!isAvailable(app)) return@launch
                if (readPending(app).length() == 0) return@launch
                val client = HealthConnectClient.getOrCreate(app)
                if (client.permissionController.getGrantedPermissions().containsAll(permissions)) return@launch
                val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                val last = prefs.getLong(KEY_ASKED_AT, 0L)
                val now = System.currentTimeMillis()
                if (now - last < ASK_COOLDOWN_MS) return@launch
                prefs.edit().putLong(KEY_ASKED_AT, now).apply()
                activity.runOnUiThread {
                    try {
                        activity.startActivity(
                            android.content.Intent(activity, HealthPermissionActivity::class.java)
                        )
                    } catch (t: Throwable) { Log.w(TAG, "prompt: ${t.message}") }
                }
            } catch (t: Throwable) {
                Log.w(TAG, "promptIfNeeded: ${t.message}")
            }
        }
    }

    /** Tenta gravar tudo que está na fila. Silencioso quando não há permissão. */
    @JvmStatic
    fun flushPending(context: Context) {
        val app = context.applicationContext
        scope.launch {
            try {
                if (!isAvailable(app)) return@launch
                val client = HealthConnectClient.getOrCreate(app)
                val granted = client.permissionController.getGrantedPermissions()
                if (!granted.containsAll(permissions)) {
                    Log.i(TAG, "sem permissão do Health Connect — treino fica na fila")
                    return@launch
                }
                val pending = readPending(app)
                if (pending.length() == 0) return@launch
                val kept = JSONArray()
                for (i in 0 until pending.length()) {
                    val o = pending.optJSONObject(i) ?: continue
                    val ok = try { insert(client, o) } catch (t: Throwable) {
                        Log.w(TAG, "falha ao gravar treino: ${t.message}"); false
                    }
                    if (!ok) kept.put(o)
                }
                writePending(app, kept)
            } catch (t: Throwable) {
                Log.w(TAG, "flushPending: ${t.message}")
            }
        }
    }

    private suspend fun insert(client: HealthConnectClient, o: JSONObject): Boolean {
        val startMs = o.optLong("startMs", 0L)
        val endMs = o.optLong("endMs", 0L)
        if (startMs <= 0L || endMs <= startMs) return true   // lixo: descarta da fila
        val start = Instant.ofEpochMilli(startMs)
        val end = Instant.ofEpochMilli(endMs)
        val zone = ZoneId.systemDefault()
        val startOffset = zone.rules.getOffset(start)
        val endOffset = zone.rules.getOffset(end)
        // Medido pelo sensor do relógio, sem digitação do usuário.
        val meta = Metadata.autoRecorded(device = Device(type = Device.TYPE_WATCH))

        val records = mutableListOf<androidx.health.connect.client.records.Record>()
        records += ExerciseSessionRecord(
            startTime = start,
            startZoneOffset = startOffset,
            endTime = end,
            endZoneOffset = endOffset,
            exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_TENNIS,
            title = "scoreplace",
            metadata = meta,
        )

        val samplesJson = o.optJSONArray("samples")
        val samples = mutableListOf<HeartRateRecord.Sample>()
        if (samplesJson != null) {
            for (i in 0 until samplesJson.length()) {
                val s = samplesJson.optJSONObject(i) ?: continue
                val t = s.optLong("t", 0L)
                val bpm = s.optLong("bpm", 0L)
                if (t < startMs || t > endMs || bpm <= 0L) continue
                samples += HeartRateRecord.Sample(
                    time = Instant.ofEpochMilli(t),
                    beatsPerMinute = bpm,
                )
            }
        }
        if (samples.isNotEmpty()) {
            records += HeartRateRecord(
                startTime = start,
                startZoneOffset = startOffset,
                endTime = end,
                endZoneOffset = endOffset,
                samples = samples,
                metadata = meta,
            )
        }
        client.insertRecords(records)
        Log.i(TAG, "treino gravado: ${(endMs - startMs) / 60000}min, ${samples.size} amostras de BPM")
        return true
    }

    // ── fila local (SharedPreferences) ───────────────────────────────────────
    private fun enqueue(context: Context, json: String) {
        try {
            val o = JSONObject(json)
            val arr = readPending(context)
            val id = o.optString("id")
            for (i in 0 until arr.length()) {
                if (arr.optJSONObject(i)?.optString("id") == id) return   // já enfileirado
            }
            arr.put(o)
            while (arr.length() > MAX_PENDING) arr.remove(0)
            writePending(context, arr)
        } catch (t: Throwable) {
            Log.w(TAG, "enqueue: ${t.message}")
        }
    }

    private fun readPending(context: Context): JSONArray =
        try {
            val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                .getString(KEY_PENDING, "[]") ?: "[]"
            JSONArray(raw)
        } catch (t: Throwable) { JSONArray() }

    private fun writePending(context: Context, arr: JSONArray) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString(KEY_PENDING, arr.toString()).apply()
    }
}

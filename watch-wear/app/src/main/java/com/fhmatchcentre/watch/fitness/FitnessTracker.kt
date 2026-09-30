package com.fhmatchcentre.watch.fitness

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.os.SystemClock
import android.util.Log
import androidx.health.services.client.ExerciseUpdateCallback
import androidx.health.services.client.HealthServices
import androidx.health.services.client.clearUpdateCallback
import androidx.health.services.client.data.Availability
import androidx.health.services.client.data.DataType
import androidx.health.services.client.data.ExerciseConfig
import androidx.health.services.client.data.ExerciseLapSummary
import androidx.health.services.client.data.ExerciseTrackedStatus
import androidx.health.services.client.data.ExerciseType
import androidx.health.services.client.data.ExerciseUpdate
import androidx.health.services.client.endExercise
import androidx.health.services.client.getCapabilities
import androidx.health.services.client.getCurrentExerciseInfo
import androidx.health.services.client.startExercise
import com.fhmatchcentre.watch.data.FitnessDao
import com.fhmatchcentre.watch.data.FitnessRow
import com.fhmatchcentre.watch.data.Prefs
import com.fhmatchcentre.watch.data.StorageJson
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import java.time.Instant

/**
 * The umpire's own workout during a match, sent to the phone with the match (never in
 * the match document, which is published). The phone shows it and can save it to
 * Health Connect. Times are ISO 8601 UTC; heart rate samples are [seconds since
 * startedAt, beats per minute], at most one every [SAMPLE_EVERY_SEC] seconds.
 */
@Serializable
data class Fitness(
    val version: Int = 1,
    val startedAt: String,
    val endedAt: String? = null,
    val steps: Long? = null,
    val distanceM: Double? = null,
    val caloriesKcal: Double? = null,
    val heartRate: HeartRate? = null,
    val heartRateSamples: List<List<Int>> = emptyList(),
)

@Serializable
data class HeartRate(val avg: Int, val min: Int, val max: Int)

/**
 * What the watch keeps while it records: the summary, plus running totals it needs to
 * carry on after the app restarts (Health Services' own totals start again at zero
 * when a new exercise starts).
 */
@Serializable
data class FitnessProgress(
    val fitness: Fitness,
    val hrSum: Long = 0,
    val hrCount: Int = 0,
    val carriedSteps: Long = 0,
    val carriedDistanceM: Double = 0.0,
    val carriedCaloriesKcal: Double = 0.0,
)

/** How the summary goes to the phone: nulls left out. */
val FitnessJson = Json {
    encodeDefaults = true
    explicitNulls = false
    ignoreUnknownKeys = true
}

/**
 * Records heart rate, steps, distance and calories from the first period to the final
 * whistle, as a Health Services exercise, when the umpire has turned it on in Settings.
 * No GPS: distance is worked out from steps. If another app (a Samsung Health workout)
 * is already recording, it's left alone and nothing is recorded here.
 */
class FitnessTracker(
    private val context: Context,
    private val dao: FitnessDao,
    private val prefs: Prefs,
    private val scope: CoroutineScope,
) {
    private val client by lazy { HealthServices.getClient(context).exerciseClient }
    private val mutex = Mutex()
    private var matchId: String? = null
    private var progress: FitnessProgress? = null
    private var ended: CompletableDeferred<Unit>? = null
    private var lastSavedMs = 0L
    private var lastSampleSec = -SAMPLE_EVERY_SEC

    /** The umpire wants it recorded, and the watch allows it. */
    val wanted: Boolean get() = prefs.fitnessTracking && permitted(context)

    private val callback = object : ExerciseUpdateCallback {
        override fun onExerciseUpdateReceived(update: ExerciseUpdate) {
            scope.launch { mutex.withLock { apply(update) } }
        }

        override fun onRegistered() {}
        override fun onRegistrationFailed(throwable: Throwable) = Log.w(TAG, "Couldn't follow the workout", throwable).let {}
        override fun onLapSummaryReceived(lapSummary: ExerciseLapSummary) {}
        override fun onAvailabilityChanged(dataType: DataType<*, *>, availability: Availability) {}
    }

    /**
     * Starts recording for a match, or picks up again after the app restarted mid-match.
     * Safe to call more than once.
     */
    // Lint wrongly flags ExerciseTrackedStatus's constants as internal to the library.
    @SuppressLint("RestrictedApi")
    suspend fun start(id: String) = mutex.withLock {
        if (!wanted || matchId == id) return@withLock
        try {
            val status = client.getCurrentExerciseInfo().exerciseTrackedStatus
            if (status == ExerciseTrackedStatus.OTHER_APP_IN_PROGRESS) {
                Log.i(TAG, "Another app is recording a workout; not recording this match")
                return@withLock
            }
            val saved = dao.get(id)?.let { StorageJson.decodeFromString(FitnessProgress.serializer(), it.progress) }
            val restarting = status != ExerciseTrackedStatus.OWNED_EXERCISE_IN_PROGRESS
            progress = when {
                saved == null -> FitnessProgress(Fitness(startedAt = Instant.now().toString()))
                // A new exercise counts from zero, so what was recorded before is carried over.
                restarting -> saved.copy(
                    carriedSteps = saved.fitness.steps ?: 0,
                    carriedDistanceM = saved.fitness.distanceM ?: 0.0,
                    carriedCaloriesKcal = saved.fitness.caloriesKcal ?: 0.0,
                )
                else -> saved
            }
            lastSampleSec = progress!!.fitness.heartRateSamples.lastOrNull()?.get(0) ?: -SAMPLE_EVERY_SEC
            matchId = id
            client.setUpdateCallback(callback)
            if (restarting) {
                val capabilities = client.getCapabilities()
                val type = EXERCISE_TYPES.firstOrNull { it in capabilities.supportedExerciseTypes }
                    ?: throw IllegalStateException("No suitable exercise type on this watch")
                val supported = capabilities.getExerciseTypeCapabilities(type).supportedDataTypes
                val config = ExerciseConfig.Builder(type)
                    .setDataTypes(DATA_TYPES.filter { it in supported }.toSet())
                    // Standing still at a penalty corner isn't a pause.
                    .setIsAutoPauseAndResumeEnabled(false)
                    .setIsGpsEnabled(false)
                    .build()
                client.startExercise(config)
                Log.i(TAG, "Recording the workout for match $id")
            }
        } catch (e: Exception) {
            Log.w(TAG, "Couldn't record the workout for match $id", e)
            runCatching { client.clearUpdateCallback(callback) }
            matchId = null
            progress = null
        }
    }

    /**
     * Stops recording and returns the summary, or null if nothing was recorded. Waits a
     * few seconds for Health Services' final figures.
     */
    suspend fun finish(id: String): Fitness? {
        val done = mutex.withLock {
            if (matchId != id) return stored(id)
            CompletableDeferred<Unit>().also { ended = it }
        }
        runCatching { client.endExercise() }.onFailure { Log.w(TAG, "Couldn't end the workout", it) }
        withTimeoutOrNull(FINAL_WAIT_MS) { done.await() }
        return mutex.withLock {
            val final = progress?.let { it.copy(fitness = it.fitness.copy(endedAt = it.fitness.endedAt ?: Instant.now().toString())) }
            final?.let { save(id, it) }
            runCatching { client.clearUpdateCallback(callback) }
            matchId = null
            progress = null
            ended = null
            final?.fitness
        }
    }

    /** The summary saved for a match, for resending. */
    suspend fun stored(id: String): Fitness? =
        dao.get(id)?.let { runCatching { StorageJson.decodeFromString(FitnessProgress.serializer(), it.progress).fitness }.getOrNull() }

    private suspend fun apply(update: ExerciseUpdate) {
        val id = matchId ?: return
        var p = progress ?: return
        val metrics = update.latestMetrics
        var f = p.fitness
        metrics.getData(DataType.STEPS_TOTAL)?.let { f = f.copy(steps = p.carriedSteps + it.total) }
        metrics.getData(DataType.DISTANCE_TOTAL)?.let { f = f.copy(distanceM = p.carriedDistanceM + it.total) }
        metrics.getData(DataType.CALORIES_TOTAL)?.let { f = f.copy(caloriesKcal = p.carriedCaloriesKcal + it.total) }

        val start = Instant.parse(f.startedAt)
        val boot = Instant.ofEpochMilli(System.currentTimeMillis() - SystemClock.elapsedRealtime())
        val samples = f.heartRateSamples.toMutableList()
        var (sum, count) = p.hrSum to p.hrCount
        var (min, max) = (f.heartRate?.min ?: Int.MAX_VALUE) to (f.heartRate?.max ?: 0)
        for (point in metrics.getData(DataType.HEART_RATE_BPM)) {
            val bpm = point.value.toInt()
            if (bpm <= 0) continue
            sum += bpm
            count++
            min = minOf(min, bpm)
            max = maxOf(max, bpm)
            val sec = (point.getTimeInstant(boot).epochSecond - start.epochSecond).toInt()
            if (sec >= 0 && sec - lastSampleSec >= SAMPLE_EVERY_SEC) {
                samples += listOf(sec, bpm)
                lastSampleSec = sec
            }
        }
        if (count > 0) f = f.copy(heartRate = HeartRate(avg = (sum / count).toInt(), min = min, max = max), heartRateSamples = samples)

        val over = update.exerciseStateInfo.state.isEnded
        if (over) f = f.copy(endedAt = f.endedAt ?: Instant.now().toString())
        p = p.copy(fitness = f, hrSum = sum, hrCount = count)
        progress = p
        // Saved now and then, so a restart loses at most half a minute.
        val now = System.currentTimeMillis()
        if (over || now - lastSavedMs >= SAVE_EVERY_MS) save(id, p)
        if (over) ended?.complete(Unit)
    }

    private suspend fun save(id: String, p: FitnessProgress) {
        lastSavedMs = System.currentTimeMillis()
        dao.upsert(FitnessRow(id, StorageJson.encodeToString(FitnessProgress.serializer(), p), lastSavedMs))
    }

    companion object {
        const val TAG = "Fitness"
        private const val SAMPLE_EVERY_SEC = 10
        private const val SAVE_EVERY_MS = 30_000L
        private const val FINAL_WAIT_MS = 8_000L

        /** No field hockey in Health Services: running, for an umpire's mix of walking and sprints. */
        private val EXERCISE_TYPES = listOf(ExerciseType.RUNNING, ExerciseType.WALKING, ExerciseType.WORKOUT)
        private val DATA_TYPES = listOf(DataType.HEART_RATE_BPM, DataType.STEPS_TOTAL, DataType.DISTANCE_TOTAL, DataType.CALORIES_TOTAL)

        /** Steps (and distance from them), and heart rate: its permission changed name in Wear OS 6. */
        val PERMISSIONS: Array<String> = arrayOf(
            Manifest.permission.ACTIVITY_RECOGNITION,
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.BAKLAVA) "android.permission.health.READ_HEART_RATE" else Manifest.permission.BODY_SENSORS,
        )

        fun permitted(context: Context): Boolean =
            PERMISSIONS.all { context.checkSelfPermission(it) == PackageManager.PERMISSION_GRANTED }
    }
}

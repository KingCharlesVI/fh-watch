package expo.modules.healthconnect

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.metadata.Device
import androidx.health.connect.client.records.metadata.Metadata
import androidx.health.connect.client.units.Energy
import androidx.health.connect.client.units.Length
import expo.modules.kotlin.activityresult.AppContextActivityResultContract
import expo.modules.kotlin.activityresult.AppContextActivityResultLauncher
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.records.Field
import java.time.Instant
import java.time.ZoneId

/** A workout from the watch, as the JS side passes it (see src/core/fitness.ts). */
class Workout : expo.modules.kotlin.records.Record {
  @Field val matchId: String = ""
  @Field val title: String = ""
  @Field val startedAt: String = ""
  @Field val endedAt: String = ""
  @Field val steps: Double? = null
  @Field val distanceM: Double? = null
  @Field val caloriesKcal: Double? = null

  /** [seconds since startedAt, beats per minute] pairs. */
  @Field val heartRateSamples: List<List<Double>> = emptyList()
}

/**
 * Saves the umpire's workouts to Health Connect, where Samsung Health (with its
 * Health Connect sync on) and other fitness apps pick them up. Write-only. Each
 * record's client ID comes from the match ID, so saving again replaces rather
 * than duplicates.
 */
class HealthConnectModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  private lateinit var askForPermissions: AppContextActivityResultLauncher<ArrayList<String>, Set<String>>

  override fun definition() = ModuleDefinition {
    Name("HealthConnect")

    RegisterActivityContracts {
      val contract = PermissionController.createRequestPermissionResultContract()
      askForPermissions = registerForActivityResult(
        object : AppContextActivityResultContract<ArrayList<String>, Set<String>> {
          override fun createIntent(context: Context, input: ArrayList<String>): Intent = contract.createIntent(context, input.toSet())
          override fun parseResult(input: ArrayList<String>, resultCode: Int, intent: Intent?): Set<String> = contract.parseResult(resultCode, intent)
        },
      )
    }

    // "available", "needs_update" (Health Connect must be installed or updated), or "unavailable".
    AsyncFunction("status") {
      status()
    }

    AsyncFunction("hasPermissions") Coroutine { ->
      status() == "available" && client().permissionController.getGrantedPermissions().containsAll(PERMISSIONS)
    }

    AsyncFunction("requestPermissions") Coroutine { ->
      if (status() != "available") return@Coroutine false
      askForPermissions.launch(ArrayList(PERMISSIONS)).containsAll(PERMISSIONS)
    }

    AsyncFunction("saveWorkout") Coroutine { w: Workout ->
      client().insertRecords(records(w))
      Unit
    }

    // Health Connect's own screen, or its Play Store page when it needs installing or updating.
    Function("openHealthConnect") {
      val intent = if (status() == "needs_update") {
        Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=$PROVIDER&url=healthconnect%3A%2F%2Fonboarding"))
      } else {
        Intent(HealthConnectClient.ACTION_HEALTH_CONNECT_SETTINGS)
      }
      context.startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
    }
  }

  private fun client() = HealthConnectClient.getOrCreate(context)

  private fun status(): String {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return "unavailable"
    return when (HealthConnectClient.getSdkStatus(context, PROVIDER)) {
      HealthConnectClient.SDK_AVAILABLE -> "available"
      HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "needs_update"
      else -> "unavailable"
    }
  }

  private fun records(w: Workout): List<Record> {
    val start = Instant.parse(w.startedAt)
    val end = Instant.parse(w.endedAt)
    val zone = ZoneId.systemDefault().rules
    val startOffset = zone.getOffset(start)
    val endOffset = zone.getOffset(end)
    val watch = Device(type = Device.TYPE_WATCH)
    fun meta(kind: String) = Metadata.activelyRecorded(watch, "fh-${w.matchId}-$kind", 1)

    // Health Connect has no field hockey: "other workout", named for the match.
    val records = mutableListOf<Record>(
      ExerciseSessionRecord(
        startTime = start,
        startZoneOffset = startOffset,
        endTime = end,
        endZoneOffset = endOffset,
        metadata = meta("session"),
        exerciseType = ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT,
        title = w.title,
      ),
    )
    w.steps?.let { records += StepsRecord(start, startOffset, end, endOffset, it.toLong(), meta("steps")) }
    w.distanceM?.let { records += DistanceRecord(start, startOffset, end, endOffset, Length.meters(it), meta("distance")) }
    w.caloriesKcal?.let { records += TotalCaloriesBurnedRecord(start, startOffset, end, endOffset, Energy.kilocalories(it), meta("calories")) }
    val samples = w.heartRateSamples
      .filter { it.size == 2 }
      .map { HeartRateRecord.Sample(start.plusSeconds(it[0].toLong()), it[1].toLong()) }
      .filter { !it.time.isAfter(end) && it.beatsPerMinute in 1..300 }
    if (samples.isNotEmpty()) records += HeartRateRecord(start, startOffset, end, endOffset, samples, meta("heart-rate"))
    return records
  }

  companion object {
    private const val PROVIDER = "com.google.android.apps.healthdata"

    private val PERMISSIONS = setOf(
      HealthPermission.getWritePermission(ExerciseSessionRecord::class),
      HealthPermission.getWritePermission(StepsRecord::class),
      HealthPermission.getWritePermission(DistanceRecord::class),
      HealthPermission.getWritePermission(TotalCaloriesBurnedRecord::class),
      HealthPermission.getWritePermission(HeartRateRecord::class),
    )
  }
}

package com.fhmatchcentre.watch.match

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioAttributes
import android.os.Build
import android.os.PowerManager
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleService
import androidx.lifecycle.lifecycleScope
import androidx.wear.ongoing.OngoingActivity
import androidx.wear.ongoing.Status
import com.fhmatchcentre.watch.MainActivity
import com.fhmatchcentre.watch.R
import com.fhmatchcentre.watch.WatchApp
import com.fhmatchcentre.watch.engine.Alert
import com.fhmatchcentre.watch.engine.MatchRecord
import com.fhmatchcentre.watch.engine.Phase
import com.fhmatchcentre.watch.engine.score
import com.fhmatchcentre.watch.engine.untilNextTick
import com.fhmatchcentre.watch.ui.periodName
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

/**
 * Keeps a match alive while it's played: a foreground service with an ongoing
 * activity (so the match stays on the watch face and in recents) that logs
 * suspensions as they end and vibrates alerts, with the screen off too. Between
 * them it sleeps, waking only when the next one is due or the match changes.
 * It stops itself when there's no match in progress.
 */
class MatchService : LifecycleService() {
    private lateinit var wakeLock: PowerManager.WakeLock
    private lateinit var haptics: Haptics
    private var shownStatus: String? = null

    override fun onCreate() {
        super.onCreate()
        haptics = Haptics(this)
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "Match in progress", NotificationManager.IMPORTANCE_LOW))
        // A health service too while a workout may be recorded; that type needs the permissions granted.
        val services = (application as WatchApp).services
        val health = if (services.fitness.wanted) ServiceInfo.FOREGROUND_SERVICE_TYPE_HEALTH else 0
        startForeground(NOTIFICATION_ID, notification("Match in progress"), ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE or health)

        // Alerts must fire on time with the screen off, when the CPU would otherwise sleep. It's
        // held only while one is to come, so a stopped clock or a forgotten match lets the watch sleep.
        wakeLock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "fh:match")
        wakeLock.setReferenceCounted(false)

        val controller = services.controller
        lifecycleScope.launch {
            while (true) {
                if (controller.active.value == null) break
                haptics.alert(controller.tick())
                val record = controller.active.value ?: break
                val status = statusLine(record)
                if (status != shownStatus) {
                    shownStatus = status
                    manager.notify(NOTIFICATION_ID, notification(status))
                }
                // Asleep until the next alert, or until the umpire changes the match (the clock, a card).
                val wait = record.untilNextTick(controller.now())
                val changed = controller.active.filter { it != record }
                if (wait == null) {
                    if (wakeLock.isHeld) wakeLock.release()
                    changed.first()
                } else {
                    wakeLock.acquire(wait + WAKE_MARGIN_MS)
                    withTimeoutOrNull(wait) { changed.first() }
                }
            }
            stopSelf()
        }
    }

    override fun onDestroy() {
        if (wakeLock.isHeld) wakeLock.release()
        super.onDestroy()
    }

    private fun statusLine(record: MatchRecord): String {
        val s = record.score()
        val teams = record.document.teams
        val phase = when (record.clock.phase) {
            Phase.READY -> "Ready"
            Phase.PLAYING -> periodName(record.clock.period, record.settings.periods) + if (record.clock.running) "" else " · stopped"
            Phase.BREAK -> "Break"
            Phase.NEXT_PERIOD -> periodName(record.clock.period, record.settings.periods) + " · ready"
            Phase.FULL_TIME -> "Full time"
            Phase.SHOOTOUT -> "Shootout"
            Phase.ENDED -> "Ended"
        }
        return "$phase · ${teams.home.name} ${s.home}–${s.away} ${teams.away.name}"
    }

    private fun notification(text: String): Notification {
        val open = PendingIntent.getActivity(
            this, 0, Intent(this, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
        )
        val builder = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.ic_stopwatch)
            .setContentTitle("Match in progress")
            .setContentText(text)
            .setCategory(NotificationCompat.CATEGORY_STOPWATCH)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(open)
        OngoingActivity.Builder(this, NOTIFICATION_ID, builder)
            .setStaticIcon(R.drawable.ic_stopwatch)
            .setTouchIntent(open)
            .setStatus(Status.Builder().addTemplate(text).build())
            .build()
            .apply(this)
        return builder.build()
    }

    companion object {
        private const val CHANNEL = "match"
        private const val NOTIFICATION_ID = 1

        /** The wake lock lasts a little past the alert it's held for, in case that's late. */
        private const val WAKE_MARGIN_MS = 10_000L

        fun start(context: Context) {
            ContextCompat.startForegroundService(context, Intent(context, MatchService::class.java))
        }
    }
}

/**
 * Distinct patterns, so the umpire can tell alerts apart without looking:
 *
 * - clock started or stopped, a suspension over: one buzz
 * - two minutes left in the period: two buzzes
 * - one minute left: three buzzes
 * - end of the period, and the 8 seconds of a shoot-out: long, short, short, long
 * - end of a break: four quick buzzes
 */
class Haptics(context: Context) {
    private val vibrator: Vibrator = context.getSystemService(VibratorManager::class.java).defaultVibrator

    fun alert(alerts: List<Alert>) {
        for (a in alerts) {
            vibrate(
                when (a) {
                    is Alert.TwoMinutesLeft -> buzzes(2)
                    is Alert.OneMinuteLeft -> buzzes(3)
                    is Alert.TimeUp -> PERIOD_END
                    is Alert.SuspensionOver -> buzzes(1)
                    is Alert.BreakOver -> longArrayOf(0, 120, 80, 120, 80, 120, 80, 120)
                },
            )
        }
    }

    /** The clock started or stopped, whichever way it was done. */
    fun buzz() = vibrate(buzzes(1))

    /** A shoot-out's 8 seconds are up. */
    fun shootoutTimeUp() = vibrate(PERIOD_END)

    private fun buzzes(n: Int): LongArray = longArrayOf(0) + List(n) { listOf(BUZZ_MS, GAP_MS) }.flatten().dropLast(1).toLongArray()

    private fun vibrate(pattern: LongArray) {
        val effect = VibrationEffect.createWaveform(pattern, -1)
        // As an alarm, so Do Not Disturb or bedtime mode can't silence a match alert.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM))
        } else {
            @Suppress("DEPRECATION")
            vibrator.vibrate(effect, AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).build())
        }
    }

    private companion object {
        const val BUZZ_MS = 300L
        const val GAP_MS = 200L
        val PERIOD_END = longArrayOf(0, 800, 200, 200, 150, 200, 200, 800)
    }
}

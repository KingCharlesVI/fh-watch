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
import com.fhmatchcentre.watch.ui.periodName
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * Keeps a match alive while it's played: a foreground service with an ongoing
 * activity (so the match stays on the watch face and in recents), ticking once
 * a second to log suspensions that end and to vibrate alerts, with the screen
 * off too. It stops itself when there's no match in progress.
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

        // Alerts must fire on time with the screen off, when the CPU would otherwise sleep.
        wakeLock = getSystemService(PowerManager::class.java).newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "fh:match")
        wakeLock.acquire(MAX_MATCH_MS)

        val controller = services.controller
        lifecycleScope.launch {
            while (true) {
                val record = controller.active.value ?: break
                haptics.alert(controller.tick())
                val status = statusLine(record)
                if (status != shownStatus) {
                    shownStatus = status
                    manager.notify(NOTIFICATION_ID, notification(status))
                }
                // Wake just after each whole second of wall time, so displays and alerts line up.
                delay(1000 - System.currentTimeMillis() % 1000 + 20)
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

        /** Longer than any real match, so a forgotten one can't drain the battery forever. */
        private const val MAX_MATCH_MS = 4 * 60 * 60 * 1000L

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
 * - end of the period: long, short, short, long
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

package com.fhmatchcentre.watch.update

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationCompat
import com.fhmatchcentre.watch.BuildConfig
import com.fhmatchcentre.watch.MainActivity
import com.fhmatchcentre.watch.R
import com.fhmatchcentre.watch.WatchApp
import com.google.android.gms.wearable.ChannelClient
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File

/**
 * Updates from the phone, in the GitHub build (BuildConfig.SELF_UPDATE): the phone downloads
 * the new watch app from GitHub and streams it here over a Data Layer channel (`/update-apk`).
 * It's kept until the umpire taps Install update on the home screen, never during a match,
 * and Android's installer asks them to confirm.
 *
 * Android only installs an update signed with the same key as this app; this also checks
 * it's this app and newer, and throws away anything else. Either way the watch tells the
 * phone (`/update-received`), so the phone knows whether it got there.
 *
 * Installing needs the watch's "Install unknown apps" allowed for this app (Settings →
 * Apps → FH Match Centre → Advanced), which Install update opens the first time.
 */
class WatchUpdater(private val context: Context) {
    private val dir = File(context.filesDir, "update")
    private val apk = File(dir, "update.apk")
    private val part = File(dir, "update.apk.part")

    private val _ready = MutableStateFlow(if (BuildConfig.SELF_UPDATE) check() else null)

    /** The version waiting to be installed, e.g. "1.1.0", or null. */
    val ready: StateFlow<String?> = _ready

    private val _problem = MutableStateFlow<String?>(null)

    /** Why the last install didn't go through, until the next try. */
    val problem: StateFlow<String?> = _problem

    /** Where an arriving update is written, until it's all here. */
    fun incoming(): File {
        dir.mkdirs()
        part.delete()
        return part
    }

    /** The whole file has arrived: keeps it if it's a newer version of this app, and says so. Returns its version, or null if it was thrown away. */
    fun arrived(): String? {
        if (part.exists()) {
            apk.delete()
            part.renameTo(apk)
        }
        _ready.value = check()
        _problem.value = null
        _ready.value?.let { notifyReady(it) }
        return _ready.value
    }

    /** The waiting update's version, after checking it; anything that isn't a newer copy of this app is deleted. */
    private fun check(): String? {
        if (!apk.exists()) return null
        val pm = context.packageManager
        val info = pm.getPackageArchiveInfo(apk.path, 0)
        val installed = pm.getPackageInfo(context.packageName, 0).longVersionCode
        if (info == null || info.packageName != context.packageName || info.longVersionCode <= installed) {
            Log.i(TAG, "Threw away an update that isn't a newer copy of this app")
            apk.delete()
            return null
        }
        return info.versionName ?: ""
    }

    /**
     * Hands the update to Android's installer, which asks the umpire to confirm. Call it from
     * the screen. The first time, it opens the setting that lets this app install apps instead.
     */
    fun install() {
        if (check() == null) {
            _ready.value = null
            return
        }
        if (!context.packageManager.canRequestPackageInstalls()) {
            _problem.value = "Allow Install unknown apps, then tap again"
            runCatching {
                context.startActivity(
                    Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
                )
            }.onFailure { Log.w(TAG, "Couldn't open the Install unknown apps setting", it) }
            return
        }
        _problem.value = null
        val installer = context.packageManager.packageInstaller
        val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
            setAppPackageName(context.packageName)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) setRequireUserAction(PackageInstaller.SessionParams.USER_ACTION_NOT_REQUIRED)
        }
        val id = installer.createSession(params)
        installer.openSession(id).use { session ->
            apk.inputStream().use { input ->
                session.openWrite("update.apk", 0, apk.length()).use { output ->
                    input.copyTo(output)
                    session.fsync(output)
                }
            }
            // Mutable: the installer adds the result to it.
            val result = PendingIntent.getBroadcast(
                context,
                id,
                Intent(context, UpdateResultReceiver::class.java).setPackage(context.packageName),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
            )
            session.commit(result.intentSender)
        }
    }

    internal fun failed(message: String?) {
        Log.w(TAG, "Update didn't install: $message")
        _problem.value = message ?: "It didn't install."
    }

    private fun notifyReady(version: String) {
        val manager = context.getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(NotificationChannel(CHANNEL, "App updates", NotificationManager.IMPORTANCE_DEFAULT))
        val open = PendingIntent.getActivity(context, 0, Intent(context, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val notification = NotificationCompat.Builder(context, CHANNEL)
            .setSmallIcon(R.drawable.ic_stopwatch)
            .setContentTitle("Update ready")
            .setContentText("FH Match Centre $version: open the app and tap Install update.")
            .setContentIntent(open)
            .setAutoCancel(true)
            .build()
        runCatching { manager.notify(NOTIFICATION_ID, notification) }
    }

    companion object {
        const val TAG = "WatchUpdater"
        const val PATH = "/update-apk"

        /** The watch's answer to the phone: "ready" when the update is kept to install, otherwise "rejected". */
        const val RECEIVED_PATH = "/update-received"
        private const val CHANNEL = "updates"
        private const val NOTIFICATION_ID = 2
    }
}

/** Android's answer about the install: it needs the umpire's OK, or it didn't go through. */
class UpdateResultReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val updater = (context.applicationContext as WatchApp).services.updater
        when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
            PackageInstaller.STATUS_PENDING_USER_ACTION -> {
                val confirm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
                } else {
                    @Suppress("DEPRECATION")
                    intent.getParcelableExtra(Intent.EXTRA_INTENT)
                }
                // The app is on screen (the umpire just tapped Install update), so it may open the dialog.
                confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let(context::startActivity)
            }
            // Success replaces the app, which closes; cancelling leaves the update waiting.
            PackageInstaller.STATUS_SUCCESS, PackageInstaller.STATUS_FAILURE_ABORTED -> {}
            else -> updater.failed(intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE))
        }
    }
}

/**
 * Receives an update from the phone, even when the app isn't open. Declared only in the
 * GitHub build's manifest (src/github/AndroidManifest.xml).
 */
class UpdateListenerService : WearableListenerService() {
    private val updater get() = (application as WatchApp).services.updater

    override fun onChannelOpened(channel: ChannelClient.Channel) {
        if (channel.path != WatchUpdater.PATH) return
        Log.i(WatchUpdater.TAG, "An update is arriving from the phone")
        Wearable.getChannelClient(this).receiveFile(channel, Uri.fromFile(updater.incoming()), false)
    }

    override fun onInputClosed(channel: ChannelClient.Channel, closeReason: Int, appSpecificErrorCode: Int) {
        if (channel.path != WatchUpdater.PATH) return
        // A file cut short isn't an app, and check() throws it away.
        val version = updater.arrived()
        Log.i(WatchUpdater.TAG, "Update arrived (close reason $closeReason): ${version ?: "thrown away"}")
        Wearable.getChannelClient(this).close(channel)
        Wearable.getMessageClient(this)
            .sendMessage(channel.nodeId, WatchUpdater.RECEIVED_PATH, (if (version != null) "ready" else "rejected").toByteArray())
            .addOnFailureListener { Log.w(WatchUpdater.TAG, "Couldn't tell the phone", it) }
    }
}

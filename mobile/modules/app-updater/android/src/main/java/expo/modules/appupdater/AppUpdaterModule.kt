package expo.modules.appupdater

import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageInstaller
import android.net.Uri
import android.os.Build
import android.provider.Settings
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/**
 * Updates from GitHub, for the GitHub build (see plugins/with-github-channel.js): downloads
 * a release's APK and installs the phone's through Android's own installer, which asks the
 * umpire to confirm. The watch's APK is downloaded here too, then sent to the watch.
 *
 * Android checks that an update is signed with the same key as the installed app, so
 * nothing else can be installed over it; this also checks the package and that it's newer.
 */
class AppUpdaterModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("AppUpdater")

    Events("onDownloadProgress", "onInstallStatus")

    OnCreate {
      InstallResultReceiver.onStatus = { status, message -> sendEvent("onInstallStatus", mapOf("status" to status, "message" to message)) }
    }

    OnDestroy {
      InstallResultReceiver.onStatus = null
    }

    // Whether the umpire has let this app install apps (Settings → Install unknown apps).
    Function("canInstallApps") {
      context.packageManager.canRequestPackageInstalls()
    }

    // That setting, for this app.
    Function("openInstallSettings") {
      val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
      appContext.throwingActivity.startActivity(intent)
    }

    // Downloads a release's APK into the cache, reporting progress. Returns the file's path.
    AsyncFunction("download") { url: String, fileName: String ->
      require(url.startsWith(RELEASES)) { "Updates only come from the project's GitHub releases." }
      require(fileName.matches(Regex("[\\w.-]+\\.apk"))) { "Not an APK name: $fileName" }
      val dir = File(context.cacheDir, "updates").apply { mkdirs() }
      val file = File(dir, fileName)
      val part = File(dir, "$fileName.part")
      val connection = URL(url).openConnection() as HttpURLConnection
      try {
        // GitHub sends the file from another host: same protocol, so this follows it.
        connection.instanceFollowRedirects = true
        connection.connectTimeout = 20_000
        connection.readTimeout = 30_000
        if (connection.responseCode !in 200..299) throw IllegalStateException("GitHub answered ${connection.responseCode}.")
        val total = connection.contentLengthLong
        var received = 0L
        var reported = -1
        connection.inputStream.use { input ->
          part.outputStream().use { output ->
            val buffer = ByteArray(64 * 1024)
            while (true) {
              val n = input.read(buffer)
              if (n < 0) break
              output.write(buffer, 0, n)
              received += n
              val percent = if (total > 0) (received * 100 / total).toInt() else -1
              if (percent != reported) {
                reported = percent
                sendEvent("onDownloadProgress", mapOf("url" to url, "received" to received.toDouble(), "total" to total.toDouble()))
              }
            }
          }
        }
        if (total > 0 && received != total) throw IllegalStateException("The download stopped part way.")
        if (!part.renameTo(file)) {
          file.delete()
          if (!part.renameTo(file)) throw IllegalStateException("Couldn't keep the download.")
        }
        file.absolutePath
      } finally {
        connection.disconnect()
        part.delete()
      }
    }

    // The package and version code of a downloaded APK, or null if it isn't one.
    AsyncFunction("apkInfo") { path: String ->
      val info = context.packageManager.getPackageArchiveInfo(path, 0) ?: return@AsyncFunction null
      mapOf("packageName" to info.packageName, "versionCode" to info.longVersionCode.toDouble())
    }

    // Installs a downloaded update to this app. Android asks the umpire to confirm, then
    // replaces the app, which closes; onInstallStatus says if it didn't go through.
    AsyncFunction("installUpdate") { path: String ->
      val pm = context.packageManager
      val apk = File(path)
      val info = pm.getPackageArchiveInfo(path, 0) ?: throw IllegalStateException("That isn't an app.")
      require(info.packageName == context.packageName) { "That's a different app." }
      val installed = pm.getPackageInfo(context.packageName, 0).longVersionCode
      require(info.longVersionCode > installed) { "That's no newer than this app." }

      val installer = pm.packageInstaller
      val params = PackageInstaller.SessionParams(PackageInstaller.SessionParams.MODE_FULL_INSTALL).apply {
        setAppPackageName(context.packageName)
        // Updating itself, Android 12 and later may not need to ask; older ones always do.
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
          Intent(context, InstallResultReceiver::class.java).setPackage(context.packageName),
          PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
        )
        session.commit(result.intentSender)
      }
    }
  }

  companion object {
    const val RELEASES = "https://github.com/KingCharlesVI/fh-watch/releases/download/"
  }
}

/** Android's answer about an install: it needs the umpire's OK, it worked, or it didn't. */
class InstallResultReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    when (intent.getIntExtra(PackageInstaller.EXTRA_STATUS, PackageInstaller.STATUS_FAILURE)) {
      PackageInstaller.STATUS_PENDING_USER_ACTION -> {
        val confirm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          intent.getParcelableExtra(Intent.EXTRA_INTENT, Intent::class.java)
        } else {
          @Suppress("DEPRECATION")
          intent.getParcelableExtra(Intent.EXTRA_INTENT)
        }
        // The app is on screen (the umpire just tapped Install), so it may open the dialog.
        confirm?.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)?.let(context::startActivity)
        onStatus?.invoke("confirming", null)
      }
      PackageInstaller.STATUS_SUCCESS -> onStatus?.invoke("installed", null)
      PackageInstaller.STATUS_FAILURE_ABORTED -> onStatus?.invoke("cancelled", null)
      else -> onStatus?.invoke("failed", intent.getStringExtra(PackageInstaller.EXTRA_STATUS_MESSAGE))
    }
  }

  companion object {
    var onStatus: ((status: String, message: String?) -> Unit)? = null
  }
}

package expo.modules.watchsync

import android.content.Context
import android.net.Uri
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

/** The JS side of watch sync. Async functions run off the main thread, so blocking calls are fine. */
class WatchSyncModule : Module() {
  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  override fun definition() = ModuleDefinition {
    Name("WatchSync")

    Events("onMatchReceived")

    OnCreate {
      WatchReceiver.onReceived = { id -> sendEvent("onMatchReceived", mapOf("id" to id)) }
    }

    OnDestroy {
      WatchReceiver.onReceived = null
    }

    AsyncFunction("listInbox") {
      WatchInbox.list(context).map { mapOf("id" to it.id, "json" to it.json, "receivedAt" to it.receivedAt.toDouble(), "fitness" to it.fitness) }
    }

    AsyncFunction("removeFromInbox") { id: String ->
      WatchInbox.remove(context, id)
    }

    AsyncFunction("pullPending") {
      WatchReceiver.pullPending(context)
    }

    AsyncFunction("connectedWatches") {
      Tasks.await(Wearable.getNodeClient(context).connectedNodes).map { mapOf("id" to it.id, "name" to it.displayName) }
    }

    // The watch app's version on each watch that has told the phone (at /watch-info), for
    // update notices. Empty without a paired watch.
    AsyncFunction("watchVersions") {
      val items = runCatching {
        Tasks.await(Wearable.getDataClient(context).getDataItems(Uri.Builder().scheme("wear").path("/watch-info").build()))
      }.getOrNull() ?: return@AsyncFunction emptyList<Map<String, Any?>>()
      try {
        items.map { item ->
          val info = DataMapItem.fromDataItem(item).dataMap
          mapOf("watchId" to item.uri.host, "version" to info.getString("version"), "build" to info.getInt("build"))
        }
      } finally {
        items.release()
      }
    }

    // Setup on phone: sends a match setup (JSON) to every watch in reach, as a message at
    // /setup. The watch opens its setup screen with it. Returns how many watches got it.
    AsyncFunction("sendSetup") { json: String ->
      val messages = Wearable.getMessageClient(context)
      val bytes = json.toByteArray()
      // Without a paired watch (or the watch's companion app) the Wearable API refuses: that's no watch too.
      val watches = runCatching { Tasks.await(Wearable.getNodeClient(context).connectedNodes) }.getOrDefault(emptyList())
      watches.count { node ->
        runCatching { Tasks.await(messages.sendMessage(node.id, "/setup", bytes)) }.isSuccess
      }
    }

    // A new watch app (an APK downloaded from GitHub) to every watch in reach, streamed over a
    // channel at /update-apk. The watch's GitHub build keeps it for the umpire to install there.
    // Returns how many watches got all of it.
    AsyncFunction("sendWatchUpdate") { path: String ->
      val file = File(path)
      require(file.isFile) { "No file at $path" }
      val channels = Wearable.getChannelClient(context)
      val watches = runCatching { Tasks.await(Wearable.getNodeClient(context).connectedNodes) }.getOrDefault(emptyList())
      watches.count { node ->
        runCatching {
          val channel = Tasks.await(channels.openChannel(node.id, "/update-apk"))
          // Closing the stream is the watch's sign that it's all there.
          Tasks.await(channels.getOutputStream(channel)).use { output -> file.inputStream().use { it.copyTo(output) } }
        }.isSuccess
      }
    }
  }
}

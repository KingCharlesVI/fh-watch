package expo.modules.watchsync

import android.content.Context
import android.net.Uri
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.util.concurrent.ConcurrentHashMap

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
    // channel at /update-apk. The watch's GitHub build keeps it for the umpire to install there,
    // and answers at /update-received: "ready", or "rejected" if it isn't a newer copy of its
    // app or didn't arrive whole. Builds before 17 don't answer. Returns how many watches the
    // file went to, and how many of those answered each way.
    AsyncFunction("sendWatchUpdate") { path: String ->
      val file = File(path)
      require(file.isFile) { "No file at $path" }
      val channels = Wearable.getChannelClient(context)
      val messages = Wearable.getMessageClient(context)
      val answers = ConcurrentHashMap<String, String>()
      val listener = MessageClient.OnMessageReceivedListener { event ->
        if (event.path == UPDATE_RECEIVED_PATH) answers[event.sourceNodeId] = String(event.data)
      }
      // Without the Wearable API there's no watch to send to either, and the count below says so.
      runCatching { Tasks.await(messages.addListener(listener)) }
      try {
        val watches = runCatching { Tasks.await(Wearable.getNodeClient(context).connectedNodes) }.getOrDefault(emptyList())
        val sent = watches.filter { node ->
          runCatching {
            val channel = Tasks.await(channels.openChannel(node.id, UPDATE_PATH))
            // Closing the stream is the watch's sign that it's all there.
            Tasks.await(channels.getOutputStream(channel)).use { output -> file.inputStream().use { it.copyTo(output) } }
          }.onFailure { Log.w(TAG, "Couldn't send the update to ${node.displayName}", it) }.isSuccess
        }
        // The last of the file can still be on its way when the stream closes.
        val deadline = System.currentTimeMillis() + ANSWER_WAIT_MS
        while (sent.any { !answers.containsKey(it.id) } && System.currentTimeMillis() < deadline) Thread.sleep(250)
        Log.i(TAG, "Update sent to ${sent.size} of ${watches.size} watches; answers: $answers")
        mapOf(
          "sent" to sent.size,
          "ready" to sent.count { answers[it.id] == "ready" },
          "rejected" to sent.count { answers[it.id] == "rejected" },
        )
      } finally {
        messages.removeListener(listener)
      }
    }
  }

  companion object {
    private const val TAG = "WatchSync"
    private const val UPDATE_PATH = "/update-apk"
    private const val UPDATE_RECEIVED_PATH = "/update-received"
    private const val ANSWER_WAIT_MS = 120_000L
  }
}

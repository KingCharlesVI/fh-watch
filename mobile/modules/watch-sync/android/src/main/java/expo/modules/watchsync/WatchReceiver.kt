package expo.modules.watchsync

import android.content.Context
import android.net.Uri
import android.util.Log
import com.google.android.gms.tasks.Tasks
import com.google.android.gms.wearable.Asset
import com.google.android.gms.wearable.DataClient
import com.google.android.gms.wearable.DataEvent
import com.google.android.gms.wearable.DataEventBuffer
import com.google.android.gms.wearable.DataItem
import com.google.android.gms.wearable.DataMapItem
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import java.io.File

/**
 * The phone's end of watch sync (see docs/design.md). A match arrives as a
 * DataItem at `/match/{id}`; it's written to a file inbox, and only then is the
 * watch told the phone has it (a message at `/ack/{id}`). The JS app drains the
 * inbox whenever it runs, so the watch never waits for the app to be opened.
 */
object WatchReceiver {
  private const val TAG = "WatchSync"
  private const val MATCH_PATH = "/match/"
  private const val ACK_PATH = "/ack/"
  private val ID = Regex("^[0-9a-fA-F-]{36}$")

  /** Set while the JS module is alive, to tell it a match has arrived. */
  @Volatile
  var onReceived: ((String) -> Unit)? = null

  /** Blocking: call off the main thread. Returns the match ID, or null if the item isn't a match. */
  fun receive(context: Context, item: DataItem): String? {
    val id = item.uri.path?.removePrefix(MATCH_PATH)?.takeIf { item.uri.path!!.startsWith(MATCH_PATH) && ID.matches(it) } ?: return null
    val map = DataMapItem.fromDataItem(item).dataMap
    val bytes = map.getByteArray("json") ?: map.getAsset("jsonAsset")?.let { readAsset(context, it) } ?: return null
    WatchInbox.write(context, id, bytes)
    Log.i(TAG, "Stored match $id from the watch (${bytes.size} bytes)")

    // The receipt. If the watch is out of reach, it keeps the match pending, and the
    // next pullPending (every time the app opens) finds the item and confirms again.
    item.uri.host?.let { node ->
      runCatching { Tasks.await(Wearable.getMessageClient(context).sendMessage(node, ACK_PATH + id, ByteArray(0))) }
        .onFailure { Log.w(TAG, "Couldn't confirm match $id to the watch", it) }
    }
    onReceived?.invoke(id)
    return id
  }

  /** Stores any matches the Data Layer holds that weren't delivered as they arrived. */
  fun pullPending(context: Context): Int {
    val uri = Uri.Builder().scheme("wear").path(MATCH_PATH).build()
    val items = Tasks.await(Wearable.getDataClient(context).getDataItems(uri, DataClient.FILTER_PREFIX))
    try {
      return items.count { runCatching { receive(context, it) }.getOrNull() != null }
    } finally {
      items.release()
    }
  }

  private fun readAsset(context: Context, asset: Asset): ByteArray? {
    val response = Tasks.await(Wearable.getDataClient(context).getFdForAsset(asset))
    return response.inputStream.use { it.readBytes() }
  }
}

/** Runs even when the app is closed; the system starts it when a match arrives. */
class WatchListenerService : WearableListenerService() {
  override fun onDataChanged(events: DataEventBuffer) {
    for (event in events) {
      if (event.type != DataEvent.TYPE_CHANGED) continue
      runCatching { WatchReceiver.receive(this, event.dataItem) }
        .onFailure { Log.e("WatchSync", "Couldn't store a match from the watch", it) }
    }
  }
}

/** Matches received but not yet taken by the JS app: one JSON file each. */
object WatchInbox {
  data class Entry(val id: String, val json: String, val receivedAt: Long)

  private fun dir(context: Context) = File(context.filesDir, "watch-inbox").apply { mkdirs() }

  @Synchronized
  fun write(context: Context, id: String, bytes: ByteArray) {
    val dir = dir(context)
    val tmp = File(dir, "$id.json.tmp")
    tmp.writeBytes(bytes)
    // A rename is atomic, so the JS side never reads half a file.
    if (!tmp.renameTo(File(dir, "$id.json"))) {
      File(dir, "$id.json").delete()
      tmp.renameTo(File(dir, "$id.json"))
    }
  }

  @Synchronized
  fun list(context: Context): List<Entry> =
    dir(context).listFiles { f -> f.name.endsWith(".json") }.orEmpty()
      .sortedBy { it.lastModified() }
      .map { Entry(it.name.removeSuffix(".json"), it.readText(), it.lastModified()) }

  @Synchronized
  fun remove(context: Context, id: String) {
    File(dir(context), "$id.json").delete()
  }
}

package com.fhmatchcentre.watch.sync

import android.content.Context
import android.net.Uri
import android.util.Log
import com.fhmatchcentre.watch.WatchApp
import com.fhmatchcentre.watch.data.MatchDao
import com.fhmatchcentre.watch.data.Setup
import com.fhmatchcentre.watch.data.decode
import com.fhmatchcentre.watch.engine.DocumentJson
import com.fhmatchcentre.watch.engine.MatchDocument
import com.fhmatchcentre.watch.engine.SCHEMA_VERSION
import com.google.android.gms.wearable.Asset
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.PutDataMapRequest
import com.google.android.gms.wearable.Wearable
import com.google.android.gms.wearable.WearableListenerService
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.tasks.await

/**
 * Watch → phone sync over the Wearable Data Layer (see docs/design.md):
 *
 * - A finished match is put as a DataItem at `/match/{id}`, marked urgent. The
 *   Data Layer delivers it whenever the phone is next in reach, even after restarts.
 * - The phone replies with a message at `/ack/{id}` once it has stored the match;
 *   only then is it marked Synced here and the DataItem removed.
 * - Resending is always safe: the phone treats the match ID as the key.
 */
class WatchSync(private val context: Context, private val dao: MatchDao) {
    private val data by lazy { Wearable.getDataClient(context) }

    suspend fun send(document: MatchDocument) {
        val json = DocumentJson.encodeToString(MatchDocument.serializer(), document).toByteArray()
        val request = PutDataMapRequest.create("$MATCH_PATH${document.id}").apply {
            dataMap.putInt("schemaVersion", SCHEMA_VERSION)
            // DataItems hold up to 100 KB; a bigger match goes as an asset.
            if (json.size <= INLINE_LIMIT) dataMap.putByteArray("json", json) else dataMap.putAsset("jsonAsset", Asset.createFromBytes(json))
            // A resend must differ from what was put before, or the phone isn't told again.
            dataMap.putLong("sentAt", System.currentTimeMillis())
        }.asPutDataRequest().setUrgent()
        data.putDataItem(request).await()
        Log.i(TAG, "Queued match ${document.id} for the phone (${json.size} bytes)")
    }

    /** Sends every finished match the phone hasn't confirmed. Returns how many. */
    suspend fun resendPending(): Int {
        val pending = dao.pending()
        for (row in pending) send(row.decode().document)
        return pending.size
    }

    suspend fun acknowledged(id: String) {
        if (dao.markSynced(id, System.currentTimeMillis()) > 0) Log.i(TAG, "Phone has match $id")
        // No host: the item this watch put, wherever the Data Layer holds it.
        data.deleteDataItems(Uri.Builder().scheme("wear").path("$MATCH_PATH$id").build()).await()
    }

    /**
     * Deletes a match from the watch. One the phone hasn't got yet is taken out of the Data
     * Layer too, so it doesn't turn up on the phone later. Matches on the phone stay there.
     */
    suspend fun delete(id: String) {
        dao.delete(id)
        runCatching { data.deleteDataItems(Uri.Builder().scheme("wear").path("$MATCH_PATH$id").build()).await() }
    }

    /** Names of the phones in reach, for the settings screen. */
    suspend fun connectedPhones(): List<String> =
        runCatching { Wearable.getNodeClient(context).connectedNodes.await().map { it.displayName } }.getOrDefault(emptyList())

    companion object {
        const val TAG = "WatchSync"
        const val MATCH_PATH = "/match/"
        const val ACK_PATH = "/ack/"
        const val SETUP_PATH = "/setup"

        /** The phone app's setup screen (expo-router route `setup`), opened from the watch. */
        const val PHONE_SETUP_URI = "fhmatchcentre://setup"
        const val INLINE_LIMIT = 90_000
    }
}

/**
 * Messages from the phone, even when the app isn't open: receipts for matches it has
 * stored (`/ack/{id}`), and match setups filled in on the phone (`/setup`, JSON).
 */
class PhoneListenerService : WearableListenerService() {
    override fun onMessageReceived(event: MessageEvent) {
        val services = (application as WatchApp).services
        when {
            event.path.startsWith(WatchSync.ACK_PATH) -> {
                val id = event.path.removePrefix(WatchSync.ACK_PATH)
                // Called on a background thread; the work is a small database update.
                runBlocking { services.sync.acknowledged(id) }
            }
            event.path == WatchSync.SETUP_PATH -> {
                val setup = Setup.fromPhone(event.data.decodeToString())
                if (setup == null) {
                    Log.w(WatchSync.TAG, "Ignored a setup from the phone that couldn't be read")
                    return
                }
                Log.i(WatchSync.TAG, "Match setup from the phone: ${setup.homeName} v ${setup.awayName}")
                services.prefs.lastSetup = setup
                services.phoneSetup.value = setup
            }
        }
    }
}

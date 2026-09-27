package com.fhmatchcentre.watch

import android.app.Application
import com.fhmatchcentre.watch.data.Prefs
import com.fhmatchcentre.watch.data.Setup
import com.fhmatchcentre.watch.data.WatchDatabase
import com.fhmatchcentre.watch.match.MatchController
import com.fhmatchcentre.watch.sync.WatchSync
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.launch

/** The app's long-lived objects, created once per process. */
class Services(app: Application) {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val db = WatchDatabase.open(app)
    val prefs = Prefs(app)
    val sync = WatchSync(app, db.matches())
    val controller = MatchController(app, db.matches(), sync, scope)

    /**
     * A setup that just arrived from the phone (Setup on phone), until the watch's
     * setup screen opens with it. It's also saved as the last setup, so it isn't lost
     * if the app wasn't waiting for it.
     */
    val phoneSetup = MutableStateFlow<Setup?>(null)
}

class WatchApp : Application() {
    lateinit var services: Services
        private set

    override fun onCreate() {
        super.onCreate()
        services = Services(this)
        services.scope.launch {
            // Synced matches are kept for 30 days, then deleted.
            services.db.matches().deleteSyncedBefore(System.currentTimeMillis() - 30L * 24 * 60 * 60 * 1000)
        }
        // So the phone can say when there's a newer watch app. Without a phone paired, it waits.
        services.scope.launch { runCatching { services.sync.announceVersion() } }
    }
}

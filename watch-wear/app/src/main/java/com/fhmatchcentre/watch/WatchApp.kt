package com.fhmatchcentre.watch

import android.app.Application
import com.fhmatchcentre.watch.data.Prefs
import com.fhmatchcentre.watch.data.Setup
import com.fhmatchcentre.watch.data.WatchDatabase
import com.fhmatchcentre.watch.fitness.FitnessTracker
import com.fhmatchcentre.watch.match.MatchController
import com.fhmatchcentre.watch.sync.WatchSync
import com.fhmatchcentre.watch.update.WatchUpdater
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
    val fitness = FitnessTracker(app, db.fitness(), prefs, scope)
    val sync = WatchSync(app, db.matches(), fitness)
    val controller = MatchController(app, db.matches(), sync, fitness, scope)

    /** Updates sent from the phone, in the GitHub build. */
    val updater = WatchUpdater(app)

    /**
     * A setup that just arrived from the phone (Setup on phone, or sent from Upcoming), until
     * the watch's setup screen opens with it, from whatever screen the app is on. It's also
     * saved as the last setup, so it isn't lost if the app wasn't open.
     */
    val phoneSetup = MutableStateFlow<Setup?>(null)

    fun receivedFromPhone(setup: Setup) {
        prefs.lastSetup = setup
        prefs.phoneSetupAt = System.currentTimeMillis()
        phoneSetup.value = setup
    }

    /** The setup screen has opened with it, or a match was on: it's done. */
    fun phoneSetupOpened() {
        phoneSetup.value = null
        prefs.phoneSetupAt = 0
    }
}

class WatchApp : Application() {
    lateinit var services: Services
        private set

    override fun onCreate() {
        super.onCreate()
        services = Services(this)
        // A setup sent while the app wasn't running opens when it's next opened, if that's soon.
        val sentAt = services.prefs.phoneSetupAt
        if (sentAt > 0 && System.currentTimeMillis() - sentAt < PHONE_SETUP_KEPT_MS) services.phoneSetup.value = services.prefs.lastSetup
        services.scope.launch {
            // Synced matches are kept for 30 days, then deleted.
            services.db.matches().deleteSyncedBefore(System.currentTimeMillis() - 30L * 24 * 60 * 60 * 1000)
            services.db.fitness().deleteOrphans()
        }
        // So the phone can say when there's a newer watch app. Without a phone paired, it waits.
        services.scope.launch { runCatching { services.sync.announceVersion() } }
    }

    companion object {
        private const val PHONE_SETUP_KEPT_MS = 30L * 60 * 1000
    }
}

package com.fhmatchcentre.watch

import android.Manifest
import android.os.Bundle
import android.os.SystemClock
import android.util.Log
import android.view.KeyEvent
import android.view.MotionEvent
import android.view.WindowManager
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.lifecycle.lifecycleScope
import androidx.wear.ambient.AmbientLifecycleObserver
import androidx.wear.compose.material3.AppScaffold
import androidx.wear.compose.material3.TimeText
import androidx.wear.compose.navigation.SwipeDismissableNavHost
import androidx.wear.compose.navigation.composable
import androidx.wear.compose.navigation.rememberSwipeDismissableNavController
import com.fhmatchcentre.watch.engine.Phase
import com.fhmatchcentre.watch.engine.Side
import com.fhmatchcentre.watch.engine.toggleClock
import com.fhmatchcentre.watch.ui.CardFlow
import com.fhmatchcentre.watch.ui.EventsScreen
import com.fhmatchcentre.watch.ui.GoalFlow
import com.fhmatchcentre.watch.ui.HomeScreen
import com.fhmatchcentre.watch.ui.MatchScreen
import com.fhmatchcentre.watch.ui.MatchesScreen
import com.fhmatchcentre.watch.ui.PhoneSetupScreen
import com.fhmatchcentre.watch.ui.SettingsScreen
import com.fhmatchcentre.watch.ui.SetupScreen
import com.fhmatchcentre.watch.ui.ShootoutScreen
import com.fhmatchcentre.watch.ui.SummaryScreen
import com.fhmatchcentre.watch.ui.WatchTheme
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

class MainActivity : ComponentActivity() {
    private val services get() = (application as WatchApp).services

    /** In ambient mode the match screen stays up in low power instead of giving way to the watch face. */
    private val ambient = mutableStateOf(false)

    private val ambientCallback = object : AmbientLifecycleObserver.AmbientLifecycleCallback {
        override fun onEnterAmbient(ambientDetails: AmbientLifecycleObserver.AmbientDetails) {
            ambient.value = true
        }

        override fun onExitAmbient() {
            ambient.value = false
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        lifecycle.addObserver(AmbientLifecycleObserver(this, ambientCallback))
        // The match service's notification is what keeps the match on the watch face.
        registerForActivityResult(ActivityResultContracts.RequestPermission()) {}.launch(Manifest.permission.POST_NOTIFICATIONS)
        lifecycleScope.launch { services.controller.restore() }
        // The screen stays on for the whole match, from setup to the end, so the clock is
        // always in view. It goes back to normal (dimming, then off) once the match ends.
        lifecycleScope.launch {
            services.controller.active.map { it != null }.distinctUntilChanged().collect { inMatch ->
                if (inMatch) window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                else window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }
        }
        setContent { WatchTheme { WatchNav(services, ambient.value) } }
    }

    /**
     * The physical button starts and stops the clock while a match is under way, on
     * every screen. Galaxy Watch 4 to 7 have no stem buttons: their lower button sends
     * Back, which apps may use (the upper one, Home, belongs to the system). Watches
     * with stem buttons use those.
     *
     * Swiping right must still go back, and on Wear OS 6 the swipe arrives as a Back key
     * too. Neither can be told apart by where it comes from: on a Galaxy Watch7 both are
     * sent by the system (device -1, no scan code). What differs, measured on a Watch7:
     *
     *   side button   flags 0x8  (FLAG_FROM_SYSTEM)                          no touch around it
     *   swipe back    flags 0x48 (FLAG_FROM_SYSTEM | FLAG_VIRTUAL_HARD_KEY)  a touch ~10 ms before
     *
     * So a Back key works the clock unless it's marked virtual or follows a touch; either
     * means a swipe, which goes back.
     *
     * `adb logcat -s FHKey` shows each Back key and what was decided, to check a new watch.
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode in CLOCK_BUTTONS && event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
            Log.d(
                "FHKey",
                "key=${event.keyCode} device=${event.deviceId} scan=${event.scanCode} flags=0x${Integer.toHexString(event.flags)} " +
                    "touching=$touching sinceTouch=${event.eventTime - lastTouchAt}ms clock=${event.isButtonPress()}",
            )
        }
        if (event.keyCode in CLOCK_BUTTONS && event.isButtonPress() && matchUnderWay()) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                services.controller.perform { toggleClock(it) }
            }
            // The release too, so the system doesn't also treat it as Back.
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    /** Touches on the screen, to tell a swipe (even one that arrives as a key) from a button press. */
    private var touching = false
    private var lastTouchAt = 0L

    override fun dispatchTouchEvent(event: MotionEvent): Boolean {
        touching = event.actionMasked != MotionEvent.ACTION_UP && event.actionMasked != MotionEvent.ACTION_CANCEL
        lastTouchAt = SystemClock.uptimeMillis()
        return super.dispatchTouchEvent(event)
    }

    /** A swipe ends just before its Back key; a button press has no touch around it. */
    private fun touchedRecently(event: KeyEvent): Boolean = touching || event.eventTime - lastTouchAt < SWIPE_KEY_WINDOW_MS

    /** A press of the side button, not a swipe that arrived as a key (see dispatchKeyEvent). */
    private fun KeyEvent.isButtonPress(): Boolean = (flags and KeyEvent.FLAG_VIRTUAL_HARD_KEY) == 0 && !touchedRecently(this)

    private fun matchUnderWay(): Boolean {
        val phase = services.controller.active.value?.clock?.phase
        return phase == Phase.READY || phase == Phase.PLAYING || phase == Phase.BREAK
    }

    private companion object {
        val CLOCK_BUTTONS = setOf(KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_STEM_1, KeyEvent.KEYCODE_STEM_2, KeyEvent.KEYCODE_STEM_3)
        const val SWIPE_KEY_WINDOW_MS = 400L
    }
}

@Composable
private fun WatchNav(services: Services, ambient: Boolean) {
    val nav = rememberSwipeDismissableNavController()
    val controller = services.controller
    val active by controller.active.collectAsState()

    // Straight to the match if one is in progress, to the shootout when it starts, and to the summary at the end.
    LaunchedEffect(active?.id, active?.clock?.phase) {
        val phase = active?.clock?.phase ?: return@LaunchedEffect
        val route = nav.currentDestination?.route
        if (phase == Phase.SHOOTOUT && route != "shootout") nav.navigate("shootout") { popUpTo("home") }
        else if (phase != Phase.SHOOTOUT && route == "home") nav.navigate("match")
    }
    LaunchedEffect(Unit) {
        controller.finished.collect { id -> nav.navigate("summary/$id") { popUpTo("home") } }
    }

    AppScaffold(timeText = { if (!ambient) TimeText() }) {
        SwipeDismissableNavHost(navController = nav, startDestination = "home") {
            composable("home") {
                HomeScreen(
                    services,
                    onNewMatch = { nav.navigate("setup") },
                    onPhoneSetup = { nav.navigate("phone-setup") },
                    onResume = { nav.navigate(if (active?.clock?.phase == Phase.SHOOTOUT) "shootout" else "match") },
                    onMatches = { nav.navigate("matches") },
                    onSettings = { nav.navigate("settings") },
                )
            }
            composable("setup") { SetupScreen(services) { nav.navigate("match") { popUpTo("home") } } }
            // Waits for the phone; its setup then opens on the watch's setup screen to check and start.
            composable("phone-setup") {
                PhoneSetupScreen(services, onReceived = { nav.navigate("setup") { popUpTo("home") } }, onSetUpHere = { nav.navigate("setup") { popUpTo("home") } })
            }
            composable("match") {
                MatchScreen(
                    services, ambient,
                    onGoal = { side -> nav.navigate("goal/${side.name}") },
                    onCard = { nav.navigate("card") },
                    onEvents = { nav.navigate("events") },
                )
            }
            composable("goal/{side}") { entry ->
                val side = entry.arguments?.getString("side")?.let { runCatching { Side.valueOf(it) }.getOrNull() }
                GoalFlow(controller, side) { nav.popBackStack() }
            }
            composable("card") { CardFlow(controller) { nav.popBackStack() } }
            composable("events") { EventsScreen(controller) }
            composable("shootout") { ShootoutScreen(controller) }
            composable("matches") { MatchesScreen(services) { id -> nav.navigate("summary/$id") } }
            composable("summary/{id}") { entry ->
                SummaryScreen(services, entry.arguments?.getString("id") ?: "") { nav.popBackStack("home", inclusive = false) }
            }
            composable("settings") { SettingsScreen(services) }
        }
    }
}

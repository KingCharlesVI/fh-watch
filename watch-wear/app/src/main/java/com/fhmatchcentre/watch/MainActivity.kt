package com.fhmatchcentre.watch

import android.Manifest
import android.os.Bundle
import android.view.KeyEvent
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
import com.fhmatchcentre.watch.ui.SettingsScreen
import com.fhmatchcentre.watch.ui.SetupScreen
import com.fhmatchcentre.watch.ui.ShootoutScreen
import com.fhmatchcentre.watch.ui.StrokeFlow
import com.fhmatchcentre.watch.ui.SummaryScreen
import com.fhmatchcentre.watch.ui.WatchTheme
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
        setContent { WatchTheme { WatchNav(services, ambient.value) } }
    }

    /**
     * The physical button starts and stops the clock while a match is under way, on
     * every screen. Galaxy Watch 4 to 7 have no stem buttons: their lower button sends
     * Back, which apps may use (the upper one, Home, belongs to the system). Watches
     * with stem buttons use those. Swiping right still goes back.
     */
    override fun dispatchKeyEvent(event: KeyEvent): Boolean {
        if (event.keyCode in CLOCK_BUTTONS && matchUnderWay()) {
            if (event.action == KeyEvent.ACTION_DOWN && event.repeatCount == 0) {
                services.controller.perform { toggleClock(it) }
            }
            // The release too, so the system doesn't also treat it as Back.
            return true
        }
        return super.dispatchKeyEvent(event)
    }

    private fun matchUnderWay(): Boolean {
        val phase = services.controller.active.value?.clock?.phase
        return phase == Phase.READY || phase == Phase.PLAYING || phase == Phase.BREAK
    }

    private companion object {
        val CLOCK_BUTTONS = setOf(KeyEvent.KEYCODE_BACK, KeyEvent.KEYCODE_STEM_1, KeyEvent.KEYCODE_STEM_2, KeyEvent.KEYCODE_STEM_3)
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
                    onResume = { nav.navigate(if (active?.clock?.phase == Phase.SHOOTOUT) "shootout" else "match") },
                    onMatches = { nav.navigate("matches") },
                    onSettings = { nav.navigate("settings") },
                )
            }
            composable("setup") { SetupScreen(services) { nav.navigate("match") { popUpTo("home") } } }
            composable("match") {
                MatchScreen(
                    services, ambient,
                    onGoal = { side -> nav.navigate("goal/${side.name}") },
                    onCard = { nav.navigate("card") },
                    onStroke = { nav.navigate("stroke") },
                    onEvents = { nav.navigate("events") },
                )
            }
            composable("goal/{side}") { entry ->
                val side = entry.arguments?.getString("side")?.let { runCatching { Side.valueOf(it) }.getOrNull() }
                GoalFlow(controller, side) { nav.popBackStack() }
            }
            composable("card") { CardFlow(controller) { nav.popBackStack() } }
            composable("stroke") { StrokeFlow(controller) { nav.popBackStack() } }
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

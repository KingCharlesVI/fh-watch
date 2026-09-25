package com.fhmatchcentre.watch.match

import android.content.Context
import android.os.SystemClock
import android.provider.Settings
import android.util.Log
import com.fhmatchcentre.watch.data.MatchDao
import com.fhmatchcentre.watch.data.SyncState
import com.fhmatchcentre.watch.data.decode
import com.fhmatchcentre.watch.data.toRow
import com.fhmatchcentre.watch.engine.Alert
import com.fhmatchcentre.watch.engine.Engine
import com.fhmatchcentre.watch.engine.MatchEvent
import com.fhmatchcentre.watch.engine.MatchRecord
import com.fhmatchcentre.watch.engine.MatchRuleException
import com.fhmatchcentre.watch.engine.MatchSettings
import com.fhmatchcentre.watch.engine.Moment
import com.fhmatchcentre.watch.engine.Phase
import com.fhmatchcentre.watch.engine.Teams
import com.fhmatchcentre.watch.engine.isUndoable
import com.fhmatchcentre.watch.engine.tick
import com.fhmatchcentre.watch.engine.undo
import com.fhmatchcentre.watch.sync.WatchSync
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/** Now, from the monotonic clock with the wall clock and boot count as a fallback. */
fun moment(context: Context): Moment = Moment(
    elapsedMs = SystemClock.elapsedRealtime(),
    wallMs = System.currentTimeMillis(),
    bootCount = Settings.Global.getInt(context.contentResolver, Settings.Global.BOOT_COUNT, 0),
)

/** A just-recorded event the umpire can take back with one tap for a few seconds. */
data class UndoOffer(val seq: Int, val label: String, val untilElapsedMs: Long)

/**
 * The match in progress: applies the umpire's actions through the engine and
 * writes every change to the database before anything else sees it.
 */
class MatchController(
    private val context: Context,
    private val dao: MatchDao,
    private val sync: WatchSync,
    private val scope: CoroutineScope,
) {
    private val mutex = Mutex()
    private val haptics = Haptics(context)
    private var createdAt = 0L

    private val _active = MutableStateFlow<MatchRecord?>(null)

    /** The match being played, or null. */
    val active: StateFlow<MatchRecord?> = _active

    private val _undo = MutableStateFlow<UndoOffer?>(null)
    val undoOffer: StateFlow<UndoOffer?> = _undo

    private val _finished = MutableSharedFlow<String>(extraBufferCapacity = 1)

    /** IDs of matches as their final whistle is recorded. */
    val finished: SharedFlow<String> = _finished

    private val _refused = MutableSharedFlow<String>(extraBufferCapacity = 4)

    /** Explanations for actions the rules didn't allow. */
    val refused: SharedFlow<String> = _refused

    fun now(): Moment = moment(context)

    /** Picks up a match that was in progress when the app last stopped. */
    suspend fun restore() = mutex.withLock {
        val row = dao.active() ?: return@withLock
        createdAt = row.createdAt
        _active.value = row.decode()
        MatchService.start(context)
    }

    suspend fun create(settings: MatchSettings, teams: Teams, venue: String?) {
        mutex.withLock {
            val now = now()
            createdAt = now.wallMs
            val record = Engine.newMatch(settings, teams, venue, now)
            save(record)
            _active.value = record
        }
        MatchService.start(context)
    }

    /** Throws away a match that never started. */
    fun discard() = scope.launch {
        mutex.withLock {
            val record = _active.value ?: return@withLock
            if (record.clock.phase != Phase.READY) return@withLock
            dao.delete(record.id)
            _active.value = null
        }
    }

    /**
     * Applies an action to the match. With `undoLabel`, the event it records can
     * be taken back from the match screen for [UNDO_WINDOW_MS].
     */
    fun perform(undoLabel: String? = null, action: MatchRecord.(Moment) -> MatchRecord) = scope.launch {
        mutex.withLock {
            val current = _active.value ?: return@withLock
            val now = now()
            val next = try {
                current.action(now)
            } catch (e: MatchRuleException) {
                _refused.tryEmit(e.message ?: "Not allowed now.")
                return@withLock
            }
            if (next == current) return@withLock
            save(next)
            _active.value = next
            // One buzz whenever the clock starts or stops: the physical button, a tap or the Stop button.
            if (next.clock.running != current.clock.running) haptics.buzz()
            if (undoLabel != null) {
                val recorded = next.document.events.drop(current.document.events.size).lastOrNull(MatchEvent::isUndoable)
                _undo.value = recorded?.let { UndoOffer(it.seq, undoLabel, now.elapsedMs + UNDO_WINDOW_MS) }
            }
            if (next.clock.phase == Phase.ENDED) finish(next)
        }
    }

    fun undo(offer: UndoOffer) {
        _undo.value = null
        perform { undo(offer.seq, it) }
    }

    /** Moves time on: logs suspensions that ran out and returns alerts to vibrate. */
    suspend fun tick(): List<Alert> = mutex.withLock {
        val current = _active.value ?: return@withLock emptyList()
        val now = now()
        _undo.value?.let { if (now.elapsedMs > it.untilElapsedMs) _undo.value = null }
        val result = current.tick(now)
        if (result.record != current) {
            save(result.record)
            _active.value = result.record
        }
        result.alerts
    }

    private suspend fun save(record: MatchRecord) {
        val ended = record.clock.phase == Phase.ENDED
        dao.upsert(record.toRow(System.currentTimeMillis(), createdAt, if (ended) SyncState.PENDING else SyncState.NONE))
    }

    private fun finish(record: MatchRecord) {
        _active.value = null
        _undo.value = null
        _finished.tryEmit(record.id)
        scope.launch {
            try {
                sync.send(record.document)
            } catch (e: Exception) {
                // It stays Not synced; "Send to phone" or the next start retries.
                Log.w(WatchSync.TAG, "Couldn't queue match ${record.id}", e)
            }
        }
    }

    companion object {
        const val UNDO_WINDOW_MS = 10_000L
    }
}

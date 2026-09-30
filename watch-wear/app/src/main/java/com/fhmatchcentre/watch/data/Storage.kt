package com.fhmatchcentre.watch.data

import android.content.Context
import androidx.room.AutoMigration
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Upsert
import com.fhmatchcentre.watch.engine.MatchRecord
import com.fhmatchcentre.watch.engine.Phase
import com.fhmatchcentre.watch.engine.score
import kotlinx.coroutines.flow.Flow
import kotlinx.serialization.json.Json

/**
 * One row per match. The whole record (document plus clock) is rewritten on
 * every event, so a crash or a flat battery loses nothing that was recorded.
 */
@Entity(tableName = "matches")
data class MatchRow(
    @PrimaryKey val id: String,
    /** The [MatchRecord] as JSON. */
    val record: String,
    val ended: Boolean,
    val sync: SyncState,
    val createdAt: Long,
    val updatedAt: Long,
    val syncedAt: Long?,
    /** For the match list, without decoding every record. */
    val title: String,
    val score: String,
)

enum class SyncState {
    /** Still being played. */
    NONE,

    /** Finished; waiting for the phone to confirm it has the match. */
    PENDING,
    SYNCED,
}

@Dao
interface MatchDao {
    @Upsert
    suspend fun upsert(row: MatchRow)

    @Query("SELECT * FROM matches WHERE id = :id")
    suspend fun get(id: String): MatchRow?

    @Query("SELECT * FROM matches WHERE ended = 0 ORDER BY createdAt DESC LIMIT 1")
    suspend fun active(): MatchRow?

    @Query("SELECT * FROM matches WHERE ended = 1 ORDER BY createdAt DESC")
    fun observeFinished(): Flow<List<MatchRow>>

    @Query("SELECT * FROM matches WHERE id = :id")
    fun observe(id: String): Flow<MatchRow?>

    @Query("SELECT * FROM matches WHERE sync = 'PENDING'")
    suspend fun pending(): List<MatchRow>

    @Query("UPDATE matches SET sync = 'SYNCED', syncedAt = :at WHERE id = :id AND sync = 'PENDING'")
    suspend fun markSynced(id: String, at: Long): Int

    @Query("DELETE FROM matches WHERE sync = 'SYNCED' AND syncedAt < :before")
    suspend fun deleteSyncedBefore(before: Long): Int

    @Query("DELETE FROM matches WHERE id = :id")
    suspend fun delete(id: String)
}

/**
 * The umpire's workout during a match (see FitnessTracker), kept apart from the match
 * because it never goes in the match document.
 */
@Entity(tableName = "fitness")
data class FitnessRow(
    @PrimaryKey val matchId: String,
    /** A FitnessProgress as JSON. */
    val progress: String,
    val updatedAt: Long,
)

@Dao
interface FitnessDao {
    @Upsert
    suspend fun upsert(row: FitnessRow)

    @Query("SELECT * FROM fitness WHERE matchId = :matchId")
    suspend fun get(matchId: String): FitnessRow?

    /** Drops workouts whose match has been deleted. */
    @Query("DELETE FROM fitness WHERE matchId NOT IN (SELECT id FROM matches)")
    suspend fun deleteOrphans(): Int
}

@Database(
    entities = [MatchRow::class, FitnessRow::class],
    version = 2,
    exportSchema = true,
    autoMigrations = [AutoMigration(from = 1, to = 2)],
)
abstract class WatchDatabase : RoomDatabase() {
    abstract fun matches(): MatchDao
    abstract fun fitness(): FitnessDao

    companion object {
        fun open(context: Context): WatchDatabase =
            Room.databaseBuilder(context, WatchDatabase::class.java, "watch.db").build()
    }
}

/** How records are stored: tolerant of fields a newer app version added. */
val StorageJson = Json {
    classDiscriminator = "type"
    encodeDefaults = true
    ignoreUnknownKeys = true
}

fun MatchRecord.toRow(now: Long, createdAt: Long, sync: SyncState, syncedAt: Long? = null): MatchRow {
    val s = score()
    return MatchRow(
        id = id,
        record = StorageJson.encodeToString(MatchRecord.serializer(), this),
        ended = clock.phase == Phase.ENDED,
        sync = sync,
        createdAt = createdAt,
        updatedAt = now,
        syncedAt = syncedAt,
        title = "${document.teams.home.name} v ${document.teams.away.name}",
        score = "${s.home}–${s.away}",
    )
}

fun MatchRow.decode(): MatchRecord = StorageJson.decodeFromString(MatchRecord.serializer(), record)

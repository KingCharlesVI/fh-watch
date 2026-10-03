# The match format

Every part of the system reads and writes the same **match document**. Its authoring source is the Zod schema in [`packages/shared/src/schema.ts`](https://github.com/KingCharlesVI/fh-watch/blob/main/packages/shared/src/schema.ts); `pnpm gen:schema` generates [`schema/match.schema.json`](https://github.com/KingCharlesVI/fh-watch/blob/main/schema/match.schema.json) from it for the watch apps.

## The document

```json
{
  "schemaVersion": 1,
  "id": "0192b3c4-5d6e-7f80-9123-456789abcdef",
  "createdOn": "wear",
  "settings": {
    "periods": 4,
    "periodLengthSec": 900,
    "breakLengthsSec": [120, 300, 120],
    "cardDurationsSec": { "green": 120, "yellowShort": 300, "yellowLong": 600 },
    "shootoutIfDrawn": false
  },
  "teams": {
    "home": { "name": "Oxford Hawks M1", "teamId": null, "color": "#1D4ED8", "captain": 7 },
    "away": { "name": "Reading M1", "teamId": null, "color": "#DC2626" }
  },
  "venue": "Pitch 1",
  "startedAt": "2026-09-19T10:00:00.000Z",
  "endedAt": "2026-09-19T11:22:40.000Z",
  "events": []
}
```

| Field | |
| --- | --- |
| `schemaVersion` | 1. The phone reads the current version and the one before; newer ones wait for an app update. |
| `id` | A UUIDv7 made on the watch: time-ordered, and the match's identity everywhere. |
| `createdOn` | `wear`, `watchos`, `mobile` or `web`. |
| `settings` | The format. `breakLengthsSec` has one entry per break (periods − 1). |
| `teams` | Names, colours (`#RRGGBB`), optional captains. `teamId` links to a club's team on the website, or is `null`. |
| `startedAt`, `endedAt` | Kickoff and the final whistle (UTC). |
| `events` | The log, in the order recorded. |

Optional fields are left out rather than set to `null`, and unknown fields are refused.

## Events

Every event has a `seq` (its position in the log, unique and ascending) and usually a `wallTime`. Events on the match clock also have a `period` and `clockMs` (time within the period, excluding stoppages). **Only `seq` orders the log**; chronological order comes from `period` and `clockMs`, so events added later on the phone slot into place.

| `type` | Extra fields | |
| --- | --- | --- |
| `period_start`, `period_end` | | A period starting and ending. |
| `clock_stop`, `clock_resume` | `reason`? | A stoppage. |
| `goal` | `team`, `player`?, `method`? (`field`, `pc`, `ps`) | Only goals count towards the score. |
| `card` | `team`, `player`?, `color`, `reason`?, `durationSec`? | Green and yellow have a `durationSec`; red doesn't. |
| `card_end` | `refSeq` | A suspension ending: logged at the match-clock time it ran out. |
| `penalty_corner` | `team` | (Older matches; the watches don't record these any more.) |
| `penalty_stroke` | `team`, `scored` | A scored stroke comes with a `goal` with method `ps`. |
| `shootout_attempt` | `team`, `round`, `player`?, `scored` | No clock time. |
| `void` | `refSeq` | Cancels an event. A void can't target another void. |
| `note` | `text` | Free text, added on the phone. |

Card reasons are `danger`, `breakdown`, `physical`, `dissent` and `other`.

## Rules the validator checks

Beyond the shape, [`validate.ts`](https://github.com/KingCharlesVI/fh-watch/blob/main/packages/shared/src/validate.ts) checks the match makes sense: `seq` ascending, periods within the settings, clock times within a period, voids pointing at real events, a stroke goal with its stroke, and so on. Errors stop an import or a save; warnings are shown to the umpire.

## Beside the document

Some things travel with a match but are never part of it, because they're the umpire's own:

- **The workout** (`fitness`): heart rate, steps, distance and calories, sent from the watch beside the document. See [`mobile/src/core/fitness.ts`](https://github.com/KingCharlesVI/fh-watch/blob/main/mobile/src/core/fitness.ts).
- **Red card reports**, kept on the phone. See [`mobile/src/core/red-card.ts`](https://github.com/KingCharlesVI/fh-watch/blob/main/mobile/src/core/red-card.ts).

Neither is uploaded or published.

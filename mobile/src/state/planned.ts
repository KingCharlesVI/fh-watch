import Storage from "expo-sqlite/kv-store";
import { afterPlanning, applyPlanned, needsPlanning, plannedBody, plannedIdOf } from "@/core/planned";
import { LAST_SETUP_KEY, readSavedSetup } from "@/core/setup";
import { type UpcomingMatch, isoDay } from "@/core/upcoming";
import { api } from "@/services";
import { upcomingStore } from "./upcoming";

/** Planned match ids already put in Upcoming once, so one deleted from there stays deleted. */
const ADDED_KEY = "plannedAdded";

const readAdded = async () => {
  const saved = await Storage.getItem(ADDED_KEY).catch(() => null);
  return new Set<string>(saved ? (JSON.parse(saved) as string[]) : []);
};
const saveAdded = (added: ReadonlySet<string>) => Storage.setItem(ADDED_KEY, JSON.stringify([...added])).catch(() => {});

const today = () => isoDay(new Date());

let queue: Promise<void> = Promise.resolve();

/**
 * Puts matches set up or changed on the phone on the website, then fetches the ones planned
 * there and brings Upcoming up to date. One at a time, so no match goes up twice. Offline,
 * nothing changes; what's still to go goes next time.
 */
export function syncPlanned(): Promise<void> {
  const run = queue.then(async () => {
    await pushPlanned();
    await pullPlanned();
  });
  queue = run.catch(() => {});
  return run;
}

async function pushPlanned() {
  const due = (await upcomingStore.load()).filter((u) => needsPlanning(u, today()));
  for (const u of due) {
    try {
      const id = plannedIdOf(u);
      const p = id ? await api.updatePlannedMatch(id, plannedBody(u)) : await api.planMatch(plannedBody(u));
      let kept = true;
      await upcomingStore.apply((list) => {
        const next = afterPlanning(list, u, p);
        kept = next.kept;
        return next.list;
      });
      if (!id) {
        // Deleted on the phone while it went up: it goes from the website too.
        if (!kept) await api.deletePlannedMatch(p.id);
        else await saveAdded((await readAdded()).add(p.id));
      }
    } catch (err) {
      console.warn("Couldn't put a match on the website", err);
    }
  }
}

async function pullPlanned() {
  const { items } = await api.myPlannedMatches();
  const [added, lastSetup] = await Promise.all([readAdded(), Storage.getItem(LAST_SETUP_KEY).catch(() => null)]);
  let after = added;
  await upcomingStore.apply((list) => {
    const next = applyPlanned(list, added, items, readSavedSetup(lastSetup), today(), new Date().toISOString());
    after = next.added;
    return next.list;
  });
  if (after.size !== added.size) await saveAdded(after);
}

/** Deletes matches from the website too, once they're gone from Upcoming. Offline, they go when their day has. */
export function forgetPlanned(matches: readonly UpcomingMatch[]) {
  for (const u of matches) {
    const id = plannedIdOf(u);
    if (id) api.deletePlannedMatch(id).catch(() => {});
  }
}

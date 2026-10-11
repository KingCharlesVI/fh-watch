import type { Db, DbOrTx } from "../db/client.js";

/** Thrown to roll a dry run back, carrying its result out. */
class DryRun<T> extends Error {
  constructor(readonly result: T) {
    super("dry run");
  }
}

/**
 * Runs `work` in a transaction. As a dry run it's rolled back afterwards, so a preview does
 * exactly what saving would, and can't differ from it.
 */
export async function maybeDryRun<T>(db: Db, dryRun: boolean, work: (tx: DbOrTx) => Promise<T>): Promise<T> {
  try {
    return await db.transaction(async (tx) => {
      const result = await work(tx);
      if (dryRun) throw new DryRun(result);
      return result;
    });
  } catch (err) {
    if (err instanceof DryRun) return err.result as T;
    throw err;
  }
}

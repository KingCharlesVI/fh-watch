import { z } from "zod";
import { MatchDocument, SCHEMA_VERSION } from "./schema.js";

/**
 * JSON Schema (draft 2020-12) for the match document, generated from the Zod
 * schema. Written to `schema/match.schema.json` by `pnpm gen:schema`; the watch
 * apps build against that file.
 */
export function buildMatchJsonSchema(): Record<string, unknown> {
  const generated = z.toJSONSchema(MatchDocument, { target: "draft-2020-12" }) as Record<string, unknown>;
  return {
    ...generated,
    $id: `https://fh-watch.local/schema/match.v${SCHEMA_VERSION}.schema.json`,
  };
}

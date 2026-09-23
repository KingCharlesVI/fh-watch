import { fileURLToPath } from "node:url";
import { buildMatchJsonSchema } from "../src/json-schema.js";

/** Committed JSON Schema the watch apps build against. */
export const MATCH_SCHEMA_PATH = fileURLToPath(new URL("../../../schema/match.schema.json", import.meta.url));

export function serializeMatchJsonSchema(): string {
  return JSON.stringify(buildMatchJsonSchema(), null, 2) + "\n";
}

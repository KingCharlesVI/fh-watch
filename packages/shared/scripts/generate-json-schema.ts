import { writeFileSync } from "node:fs";
import { MATCH_SCHEMA_PATH, serializeMatchJsonSchema } from "./match-schema-file.js";

writeFileSync(MATCH_SCHEMA_PATH, serializeMatchJsonSchema());
console.log(`Wrote ${MATCH_SCHEMA_PATH}`);

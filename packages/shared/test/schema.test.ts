import { readFileSync } from "node:fs";
import { Ajv2020 } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";
import { describe, expect, it } from "vitest";
import { MATCH_SCHEMA_PATH, serializeMatchJsonSchema } from "../scripts/match-schema-file.js";
import { buildMatchJsonSchema } from "../src/json-schema.js";
import { MatchDocument } from "../src/schema.js";
import { leagueMatch, shootoutMatch } from "./fixtures.js";

// ajv-formats is CommonJS; under NodeNext its plugin is on `.default`.
const addFormats = addFormatsModule.default;

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);
const validateWithJsonSchema = ajv.compile(buildMatchJsonSchema());

/** Documents both validators must reject. */
const invalidDocuments: [string, (m: Record<string, any>) => void][] = [
  ["unknown top-level field", (m) => (m.referee = "Sam")],
  ["unknown event field", (m) => (m.events[1].assist = 8)],
  ["wrong schemaVersion", (m) => (m.schemaVersion = 2)],
  ["bad match id", (m) => (m.id = "not-a-uuid")],
  ["bad colour", (m) => (m.teams.home.color = "blue")],
  ["unknown event type", (m) => (m.events[1].type = "own_goal")],
  ["goal without team", (m) => delete m.events[1].team],
  ["fractional clock", (m) => (m.events[1].clockMs = 1.5)],
  ["negative clock", (m) => (m.events[1].clockMs = -1)],
  ["wall time with offset", (m) => (m.events[0].wallTime = "2026-09-19T14:02:11+01:00")],
  ["zero periods", (m) => (m.settings.periods = 0)],
  ["missing events", (m) => delete m.events],
];

describe("match schema", () => {
  it.each([
    ["league match", leagueMatch],
    ["shootout match", shootoutMatch],
  ])("accepts the %s fixture in Zod and JSON Schema", (_, load) => {
    const doc = load();
    expect(MatchDocument.safeParse(doc).success).toBe(true);
    expect(validateWithJsonSchema(doc), JSON.stringify(validateWithJsonSchema.errors)).toBe(true);
  });

  it.each(invalidDocuments)("rejects a document with %s in Zod and JSON Schema", (_, mutate) => {
    const doc = leagueMatch() as unknown as Record<string, any>;
    mutate(doc);
    expect(MatchDocument.safeParse(doc).success).toBe(false);
    expect(validateWithJsonSchema(doc)).toBe(false);
  });

  it("committed schema/match.schema.json is up to date (run `pnpm gen:schema`)", () => {
    expect(readFileSync(MATCH_SCHEMA_PATH, "utf8").replace(/\r\n/g, "\n")).toBe(serializeMatchJsonSchema());
  });
});

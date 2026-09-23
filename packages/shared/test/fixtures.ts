import { readFileSync } from "node:fs";
import type { MatchDocument } from "../src/schema.js";

function load(name: string): MatchDocument {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as MatchDocument;
}

/** A fresh copy each call, so tests can mutate it. */
export const leagueMatch = (): MatchDocument => load("league-match.json");
export const shootoutMatch = (): MatchDocument => load("shootout-match.json");

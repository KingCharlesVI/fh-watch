import { describe, expect, it } from "vitest";
import { checkServer } from "../src/core/server-status";

const answer = (status: number) => (async () => new Response(status === 200 ? '{"ok":true}' : "", { status })) as typeof fetch;

describe("checkServer", () => {
  it("is online, with how long the server took, when the health check answers", async () => {
    let t = 1000;
    const urls: string[] = [];
    const fetchFn = (async (url: string) => {
      urls.push(url);
      t += 140;
      return new Response('{"ok":true}');
    }) as typeof fetch;
    expect(await checkServer("https://app.example", { fetch: fetchFn, now: () => t })).toEqual({ state: "online", ms: 140 });
    expect(urls).toEqual(["https://app.example/v1/health"]);
  });

  it("counts a rate-limited answer as online", async () => {
    expect((await checkServer("https://app.example", { fetch: answer(429) })).state).toBe("online");
  });

  it("is a problem when the server answers with an error", async () => {
    expect(await checkServer("https://app.example", { fetch: answer(502) })).toEqual({ state: "problem", status: 502 });
  });

  it("is unreachable when nothing answers, or not in time", async () => {
    const offline = (async () => {
      throw new TypeError("Network request failed");
    }) as typeof fetch;
    expect(await checkServer("https://app.example", { fetch: offline })).toEqual({ state: "unreachable" });

    const never = ((_: string, init?: RequestInit) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)))) as typeof fetch;
    expect(await checkServer("https://app.example", { fetch: never, timeoutMs: 20 })).toEqual({ state: "unreachable" });
  });
});

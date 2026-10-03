import { describe, expect, it } from "vitest";
import { ApiError, NetworkError } from "../src/core/api";
import { CLUBS, USER } from "./fake-api";
import { setup } from "./helpers";

describe("ApiClient", () => {
  it("signs in and stores the tokens", async () => {
    const t = await setup({ signIn: false });
    expect(await t.api.login(USER.email, "correct horse battery")).toMatchObject({ id: USER.id });
    expect(t.tokens.tokens).toMatchObject({ accessToken: "at-1", refreshToken: "rt-1" });
    expect(await t.api.me()).toMatchObject({ email: USER.email });
  });

  it("rejects a wrong password with the API's message", async () => {
    const t = await setup({ signIn: false });
    await expect(t.api.login(USER.email, "nope")).rejects.toThrow("Email or password is wrong.");
    expect(t.tokens.tokens).toBeNull();
  });

  it("registers without a session, and asks for another confirmation email", async () => {
    const t = await setup({ signIn: false });
    const reply = await t.api.register({ email: "new@example.com", password: "a long enough one", displayName: "Alex" });
    expect(reply.message).toMatch(/email/);
    expect(t.server.registrations).toEqual([{ email: "new@example.com", displayName: "Alex", clubRequest: undefined }]);
    expect(t.tokens.tokens).toBeNull();

    await t.api.resendVerification("new@example.com");
    expect(t.server.verificationEmails).toEqual(["new@example.com", "new@example.com"]);
  });

  it("passes a club request on, and finds clubs without a session", async () => {
    const t = await setup({ signIn: false });
    await t.api.register({ email: "admin@example.com", password: "a long enough one", displayName: "Jo", clubRequest: { clubId: CLUBS[0]!.id } });
    expect(t.server.registrations[0]?.clubRequest).toEqual({ clubId: CLUBS[0]!.id });
    expect(await t.api.searchClubs("hawks")).toEqual({ items: [CLUBS[0]] });
  });

  it("refreshes an access token that's about to expire, once, for parallel requests", async () => {
    const t = await setup();
    t.advance(14.8 * 60_000);
    await Promise.all([t.api.me(), t.api.me(), t.api.me()]);
    expect(t.server.count("POST /v1/auth/refresh")).toBe(1);
    expect(t.tokens.tokens?.refreshToken).toBe("rt-2");
  });

  it("refreshes and retries once when a fresh-looking token is refused", async () => {
    const t = await setup();
    t.server.expireAccessTokens();
    expect(await t.api.me()).toMatchObject({ id: USER.id });
    expect(t.server.count("POST /v1/auth/refresh")).toBe(1);
  });

  it("signs out when the session can't be refreshed", async () => {
    const t = await setup();
    t.server.revokeSessions();
    await expect(t.api.me()).rejects.toBeInstanceOf(ApiError);
    expect(t.tokens.tokens).toBeNull();
    expect(t.signedOut.count).toBe(1);
  });

  it("reports an unreachable server as a NetworkError and keeps the session", async () => {
    const t = await setup();
    t.server.offline = true;
    await expect(t.api.me()).rejects.toBeInstanceOf(NetworkError);
    t.advance(20 * 60_000);
    await expect(t.api.me()).rejects.toBeInstanceOf(NetworkError);
    expect(t.tokens.tokens).not.toBeNull();
  });
});

import { hash, verify } from "@node-rs/argon2";
import { and, eq, isNull } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import type { Config } from "../config.js";
import type { DbOrTx } from "../db/client.js";
import { emailTokens, refreshTokens } from "../db/schema.js";
import { randomToken, sha256 } from "../lib/crypto.js";

export const ACCESS_TOKEN_TTL_SEC = 15 * 60;
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** A just-rotated refresh token still works this long, so parallel requests from one client don't look like theft. */
export const REFRESH_REUSE_GRACE_MS = 30 * 1000;
export const EMAIL_TOKEN_TTL_MS = { verify_email: 24 * 60 * 60 * 1000, reset_password: 60 * 60 * 1000 } as const;

const ISSUER = "fh-api";
const AUDIENCE = "fh";

// Passwords: argon2id with the library's defaults (19 MiB, 2 passes).
export const hashPassword = (password: string) => hash(password);
export const verifyPassword = (passwordHash: string, password: string) => verify(passwordHash, password);

/** A hash of a random password, so a sign-in for an unknown email takes as long as a real one. */
let dummyHash: Promise<string> | undefined;
export const timingSafeDummyVerify = async (password: string) => {
  dummyHash ??= hash(randomToken());
  await verify(await dummyHash, password);
};

export async function signAccessToken(config: Config, userId: string, now: Date): Promise<string> {
  const iat = Math.floor(now.getTime() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt(iat)
    .setExpirationTime(iat + ACCESS_TOKEN_TTL_SEC)
    .sign(config.jwtSecret);
}

/** Returns the user id, or null if the token is invalid or expired. */
export async function verifyAccessToken(config: Config, token: string, now: Date): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, config.jwtSecret, {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ["HS256"],
      currentDate: now,
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

export async function issueRefreshToken(db: DbOrTx, userId: string, familyId: string, now: Date): Promise<string> {
  const token = randomToken();
  await db.insert(refreshTokens).values({
    userId,
    familyId,
    tokenHash: sha256(token),
    expiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_MS),
  });
  return token;
}

export async function revokeAllRefreshTokens(db: DbOrTx, userId: string, now: Date): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: now })
    .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
}

export async function issueEmailToken(
  db: DbOrTx,
  userId: string,
  purpose: keyof typeof EMAIL_TOKEN_TTL_MS,
  now: Date,
): Promise<string> {
  const token = randomToken();
  await db.insert(emailTokens).values({
    userId,
    purpose,
    tokenHash: sha256(token),
    expiresAt: new Date(now.getTime() + EMAIL_TOKEN_TTL_MS[purpose]),
  });
  return token;
}

import { createHash, randomBytes, randomInt } from "node:crypto";

/** 256-bit random token, base64url. Sent to users; only its hash is stored. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** No 0/O or 1/I, so codes survive being read aloud or typed from paper. */
const SHARE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

export function shareCode(length = 6): string {
  let code = "";
  for (let i = 0; i < length; i++) code += SHARE_ALPHABET[randomInt(SHARE_ALPHABET.length)];
  return code;
}

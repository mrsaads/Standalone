import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// Encrypts the Google Drive refresh token before it is stored in drive_connections.
// refresh_token_encrypted — see db/schema.ts's comment on that table. AES-256-GCM with a random
// 12-byte IV per encryption call; the stored string packs iv:authTag:ciphertext (all hex) so
// decryption needs nothing beyond the key and this one string.
//
// DRIVE_TOKEN_ENCRYPTION_KEY must be set in the deployment environment (see the handover's
// credential checklist). It is stretched to a 32-byte AES key with scrypt rather than used raw, so
// the operator does not need to hand-generate exact key bytes — but "any random string works" is
// not a useful instruction to hand someone, so this is the one exact command to run, and its
// output's format/length is what this file actually checks below:
//
//   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
//
// That prints a 44-character base64 string (32 bytes of real entropy). Paste that whole string, as
// printed, into DRIVE_TOKEN_ENCRYPTION_KEY in Render's environment settings — nothing else needs
// to be derived or reformatted from it. MIN_SECRET_LENGTH below is set to exactly the length of
// that command's output, so a key generated any other, weaker way (e.g. a short hand-typed phrase)
// is rejected at startup rather than silently accepted.
const MIN_SECRET_LENGTH = 44;

function deriveKey(): Buffer {
  const secret = process.env.DRIVE_TOKEN_ENCRYPTION_KEY;
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(`DRIVE_TOKEN_ENCRYPTION_KEY is not configured correctly. Generate it with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))" — and use that command's output exactly as printed (${MIN_SECRET_LENGTH} characters).`);
  }
  return scryptSync(secret, "improvexus-drive-token", 32);
}

export function encryptToken(plaintext: string): string {
  const key = deriveKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${ciphertext.toString("hex")}`;
}

export function decryptToken(stored: string): string {
  const key = deriveKey();
  const [ivHex, authTagHex, ciphertextHex] = stored.split(":");
  if (!ivHex || !authTagHex || !ciphertextHex) throw new Error("Stored Drive token is malformed.");
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]).toString("utf8");
}

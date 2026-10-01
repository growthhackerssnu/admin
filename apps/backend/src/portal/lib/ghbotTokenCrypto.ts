import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;

function encryptionKey() {
  const configured = process.env.GHBOT_TOKEN_ENCRYPTION_KEY;
  if (!configured) throw new Error("GHBOT_TOKEN_ENCRYPTION_KEY is not configured");

  const key = Buffer.from(configured, "base64url");
  if (key.length !== 32) throw new Error("GHBOT_TOKEN_ENCRYPTION_KEY must be a base64url-encoded 32-byte key");
  return key;
}

// Serialized as version:iv:authTag:ciphertext. The key itself is only kept in
// the deployment secret store; neither the key nor plaintext reaches the DB.
export function encryptGhbotToken(plaintext: string) {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return ["v1", iv.toString("base64url"), authTag.toString("base64url"), ciphertext.toString("base64url")].join(":");
}

export function decryptGhbotToken(serialized: string) {
  const [version, ivPart, authTagPart, ciphertextPart, extra] = serialized.split(":");
  if (version !== "v1" || !ivPart || !authTagPart || !ciphertextPart || extra) {
    throw new Error("Invalid GH Bot token ciphertext");
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(ivPart, "base64url"));
  decipher.setAuthTag(Buffer.from(authTagPart, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextPart, "base64url")), decipher.final()]).toString("utf8");
}

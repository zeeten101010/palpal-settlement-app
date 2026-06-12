import { cookies } from "next/headers";
import crypto from "crypto";

const COOKIE_NAME = "palpal_settlement_session";
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function getSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error("SESSION_SECRET is missing");
  return secret;
}

function sign(value: string) {
  return crypto.createHmac("sha256", getSecret()).update(value).digest("hex");
}

export function createSessionValue() {
  const issuedAt = Date.now().toString();
  const signature = sign(issuedAt);
  return `${issuedAt}.${signature}`;
}

export function verifySessionValue(value?: string) {
  if (!value) return false;

  const [issuedAt, signature] = value.split(".");
  if (!issuedAt || !signature) return false;

  const expected = sign(issuedAt);
  const safeEqual =
    expected.length === signature.length &&
    crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));

  if (!safeEqual) return false;

  const ageSeconds = (Date.now() - Number(issuedAt)) / 1000;
  return ageSeconds >= 0 && ageSeconds <= SESSION_MAX_AGE_SECONDS;
}

export async function isAuthed() {
  const cookieStore = await cookies();
  const value = cookieStore.get(COOKIE_NAME)?.value;
  return verifySessionValue(value);
}

export async function setAuthCookie(value: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: "/"
  });
}

export async function clearAuthCookie() {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/"
  });
}

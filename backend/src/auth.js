import { createHmac, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);

export const DEFAULT_ADMIN_USERNAME = "admin";
export const DEFAULT_INITIAL_PASSWORD = "admin123456";

const SESSION_COOKIE = "lattice_session";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const SCRYPT_KEY_LENGTH = 64;

export function readBearerToken(request) {
  const authorization = request.headers.authorization ?? "";
  if (authorization.startsWith("Bearer ")) return authorization.slice("Bearer ".length).trim();
  return request.headers["x-agent-token"] ?? "";
}

export function requireAgentToken(request, expectedToken) {
  const token = readBearerToken(request);
  if (!safeEqual(token, expectedToken)) {
    throw Object.assign(new Error("Invalid agent token"), { statusCode: 401 });
  }
}

export function createAuthConfig(options = {}) {
  return {
    username: options.username ?? process.env.ADMIN_USERNAME ?? DEFAULT_ADMIN_USERNAME,
    initialPassword:
      options.initialPassword ??
      process.env.ADMIN_INITIAL_PASSWORD ??
      process.env.ADMIN_PASSWORD ??
      process.env.LATTICE_ADMIN_PASSWORD ??
      DEFAULT_INITIAL_PASSWORD,
    sessionSecret:
      options.sessionSecret ??
      process.env.SESSION_SECRET ??
      process.env.AGENT_TOKEN ??
      "dev-session-secret-change-me",
    cookieSecure: String(options.cookieSecure ?? process.env.COOKIE_SECURE ?? "false") === "true"
  };
}

export function requireDashboardSession(request, config) {
  const session = readSession(request, config.sessionSecret);
  if (!session) {
    throw Object.assign(new Error("Dashboard login required"), { statusCode: 401 });
  }
  return session;
}

export function issueSessionCookie(response, username, config) {
  const token = createSession(username, config.sessionSecret);
  response.setHeader("Set-Cookie", cookieValue(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "Lax",
    secure: config.cookieSecure,
    path: "/",
    maxAge: SESSION_TTL_SECONDS
  }));
}

export function clearSessionCookie(response, config) {
  response.setHeader("Set-Cookie", cookieValue(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "Lax",
    secure: config.cookieSecure,
    path: "/",
    maxAge: 0
  }));
}

export function readSession(request, secret) {
  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  if (!safeEqual(signature, sign(payload, secret))) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!session.exp || Date.now() > session.exp) return null;
    return session;
  } catch {
    return null;
  }
}

export async function hashPassword(password) {
  const salt = randomBytes(16).toString("base64url");
  const key = await scrypt(String(password), salt, SCRYPT_KEY_LENGTH);
  return `scrypt$${salt}$${Buffer.from(key).toString("base64url")}`;
}

export async function verifyPassword(password, encodedHash) {
  const [, salt, storedHash] = String(encodedHash ?? "").split("$");
  if (!salt || !storedHash) return false;

  const key = await scrypt(String(password), salt, SCRYPT_KEY_LENGTH);
  return safeEqual(Buffer.from(key).toString("base64url"), storedHash);
}

export function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

function createSession(username, secret) {
  const payload = Buffer.from(JSON.stringify({
    sub: username,
    exp: Date.now() + SESSION_TTL_SECONDS * 1000
  })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

function sign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function parseCookies(request) {
  const header = request.headers.cookie ?? "";
  return Object.fromEntries(header.split(";").map((part) => {
    const [key, ...rest] = part.trim().split("=");
    return [key, decodeURIComponent(rest.join("=") ?? "")];
  }).filter(([key]) => key));
}

function cookieValue(name, value, options) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${options.maxAge}`,
    `Path=${options.path}`,
    `SameSite=${options.sameSite}`
  ];
  if (options.httpOnly) parts.push("HttpOnly");
  if (options.secure) parts.push("Secure");
  return parts.join("; ");
}

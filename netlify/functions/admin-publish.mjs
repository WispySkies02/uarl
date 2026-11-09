import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";
import "../../assets/result-drivers.js";
import "../../assets/standings.js";

const STORE_NAME = "uarl-race-control";
const DATA_KEY = "website-data";
const USERS_KEY = "admin-users";
const AUDIT_KEY = "admin-audit";
const SESSION_COOKIE = "uarl_admin_session";
const SESSION_SECONDS = 60 * 60 * 12;
const ROLES = new Set(["owner", "admin", "race_control"]);

const json = (status, body, extraHeaders = {}) => new Response(JSON.stringify(body), {
  status,
  headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders }
});

function safeEqual(left, right) {
  const a = Buffer.from(String(left || ""));
  const b = Buffer.from(String(right || ""));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function validPayload(data) {
  return data && typeof data === "object" && Array.isArray(data.events) && Array.isArray(data.records) &&
    data.drivers && Array.isArray(data.drivers.teams) && Array.isArray(data.paints) && data.history && Array.isArray(data.guide);
}

function cleanUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function validUsername(value) {
  return /^[a-z0-9._-]{3,32}$/.test(value);
}

function publicUser(user) {
  return user ? {
    id: user.id, username: user.username, displayName: user.displayName, role: user.role,
    active: user.active, createdAt: user.createdAt, createdBy: user.createdBy || "System", lastLoginAt: user.lastLoginAt || null
  } : null;
}

function scrypt(password, salt) {
  return new Promise((resolve, reject) => crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key)));
}

async function passwordRecord(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt);
  return { passwordSalt: salt, passwordHash: hash.toString("hex") };
}

async function passwordMatches(password, user) {
  if (!user || !user.passwordSalt || !user.passwordHash) return false;
  const hash = await scrypt(String(password || ""), user.passwordSalt);
  return safeEqual(hash.toString("hex"), user.passwordHash);
}

function signed(value, secret) {
  return crypto.createHmac("sha256", secret).update(value).digest("base64url");
}

function sessionCookie(user, secret) {
  const payload = Buffer.from(JSON.stringify({ uid: user.id, exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS })).toString("base64url");
  return `${SESSION_COOKIE}=${payload}.${signed(payload, secret)}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}

function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;
}

function cookieValue(request, name) {
  const cookies = request.headers.get("cookie") || "";
  const match = cookies.split(";").map((value) => value.trim()).find((value) => value.startsWith(`${name}=`));
  return match ? match.slice(name.length + 1) : "";
}

async function sessionUser(request, secret, store) {
  if (!secret) return null;
  const [payload, supplied] = cookieValue(request, SESSION_COOKIE).split(".");
  if (!payload || !safeEqual(supplied, signed(payload, secret))) return null;
  let session;
  try { session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); } catch { return null; }
  if (!session.uid || Number(session.exp) <= Math.floor(Date.now() / 1000)) return null;
  const users = await store.get(USERS_KEY, { type: "json", consistency: "strong" }) || [];
  return users.find((user) => user.id === session.uid && user.active) || null;
}

async function addAudit(store, entry) {
  const audit = await store.get(AUDIT_KEY, { type: "json", consistency: "strong" }) || [];
  audit.unshift({ id: crypto.randomUUID(), at: new Date().toISOString(), ...entry });
  await store.setJSON(AUDIT_KEY, audit.slice(0, 100));
}

function accountInput(payload) {
  const username = cleanUsername(payload.username);
  const displayName = String(payload.displayName || "").trim().slice(0, 60);
  const role = String(payload.role || "race_control");
  const password = String(payload.password || "");
  if (!validUsername(username)) return { error: "Username must be 3–32 characters using letters, numbers, dots, dashes, or underscores." };
  if (!displayName) return { error: "Enter a display name." };
  if (!ROLES.has(role)) return { error: "Select a valid account role." };
  if (password.length < 10) return { error: "Passwords must contain at least 10 characters." };
  return { username, displayName, role, password };
}

export function raceControlChangeOnly(nextData, currentData) {
  if (!currentData) return false;
  const strip = (value) => {
    const copy = JSON.parse(JSON.stringify(value));
    delete copy.events;
    delete copy.records;
    delete copy.standings;
    if (copy.race) delete copy.race.schedule;
    return copy;
  };
  return JSON.stringify(strip(nextData)) === JSON.stringify(strip(currentData));
}

export function validateRaceBonuses(data) {
  return globalThis.UARLResultDrivers.bonusIssues(data);
}

export function validateStandings(data) {
  return globalThis.UARLStandings.validate(data);
}

const IMAGE_LIMIT = 2 * 1024 * 1024;
export function decodeDriverImage(value) {
  if (typeof value !== "string" || value.length > Math.ceil(IMAGE_LIMIT / 3) * 4 + 100) throw new Error("Image is too large after resizing. Try a smaller image.");
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || match[2].length % 4 !== 0) throw new Error("Choose a PNG, JPEG or WebP image.");
  const bytes = Buffer.from(match[2], "base64");
  if (!bytes.length || bytes.length > IMAGE_LIMIT) throw new Error("Image is too large after resizing.");
  const valid = match[1] === "image/png" ? bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
    match[1] === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 :
    bytes.toString("ascii",0,4) === "RIFF" && bytes.toString("ascii",8,12) === "WEBP";
  if (!valid) throw new Error("The image contents do not match its file type.");
  return { bytes, contentType: match[1] };
}

export default async (request) => {
  const secret = process.env.UARL_ADMIN_KEY || "";
  const url = new URL(request.url);
  const store = getStore(STORE_NAME);

  if (request.method === "GET" && url.searchParams.has("image")) {
    const id = url.searchParams.get("image");
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) return json(404, { error: "Image not found." });
    try {
      const image = await store.getWithMetadata("driver-images/" + id, { type: "arrayBuffer" });
      if (!image) return json(404, { error: "Image not found." });
      return new Response(image.data, { headers: { "content-type": image.metadata.contentType, "cache-control": "public, max-age=31536000, immutable", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'" } });
    } catch { return json(503, { error: "Image storage is temporarily unavailable." }); }
  }

  if (request.method === "GET" && url.searchParams.get("status") === "1") {
    if (!secret) return json(200, { ready: false, needsSetup: false, user: null });
    try {
      const users = await store.get(USERS_KEY, { type: "json", consistency: "strong" }) || [];
      const user = await sessionUser(request, secret, store);
      return json(200, { ready: true, needsSetup: users.length === 0, user: publicUser(user) });
    } catch (error) {
      return json(503, { error: "The Admin account store is temporarily unavailable." });
    }
  }

  if (request.method === "GET") {
    try {
      const record = await store.get(DATA_KEY, { type: "json", consistency: "strong" });
      return json(200, record && record.data ? record : { data: null, source: "static" });
    } catch (error) {
      return json(200, { data: null, source: "static", warning: "Live data has not been published yet." });
    }
  }

  if (request.method !== "POST") return json(405, { error: "Method not allowed." });
  if (!secret) return json(503, { error: "Admin accounts are not configured. Add UARL_ADMIN_KEY in Netlify environment variables." });

  let payload;
  try { payload = await request.json(); } catch { return json(400, { error: "Invalid JSON request." }); }

  try {
    if (payload.action === "setup") {
      const existing = await store.get(USERS_KEY, { type: "json", consistency: "strong" }) || [];
      if (existing.length) return json(409, { error: "The Owner account has already been created." });
      if (!safeEqual(payload.setupKey, secret)) return json(401, { error: "Incorrect one-time setup key." });
      const input = accountInput({ ...payload, role: "owner" });
      if (input.error) return json(422, { error: input.error });
      const createdAt = new Date().toISOString();
      const user = { id: crypto.randomUUID(), username: input.username, displayName: input.displayName, role: "owner", active: true, createdAt, createdBy: "Initial setup", lastLoginAt: createdAt, ...await passwordRecord(input.password) };
      const result = await store.setJSON(USERS_KEY, [user], { onlyIfNew: true });
      if (!result.modified) return json(409, { error: "The Owner account was created in another session. Sign in instead." });
      await addAudit(store, { type: "account_created", actorId: user.id, actorName: user.displayName, detail: `Created Owner account @${user.username}` });
      return json(200, { ok: true, user: publicUser(user), message: "Owner account created." }, { "set-cookie": sessionCookie(user, secret) });
    }

    if (payload.action === "login") {
      const username = cleanUsername(payload.username);
      const users = await store.get(USERS_KEY, { type: "json", consistency: "strong" }) || [];
      const user = users.find((item) => item.username === username);
      if (!user || !user.active || !await passwordMatches(payload.password, user)) return json(401, { error: "Incorrect username or password." });
      user.lastLoginAt = new Date().toISOString();
      await store.setJSON(USERS_KEY, users);
      await addAudit(store, { type: "login", actorId: user.id, actorName: user.displayName, detail: `@${user.username} signed in` });
      return json(200, { ok: true, user: publicUser(user), message: "Signed in to UARL Race Control." }, { "set-cookie": sessionCookie(user, secret) });
    }

    if (payload.action === "logout") return json(200, { ok: true }, { "set-cookie": clearSessionCookie() });

    const user = await sessionUser(request, secret, store);
    if (!user) return json(401, { error: "Your Admin session expired. Sign in again." });

    if (payload.action === "upload-driver-image") {
      if (user.role !== "owner" && user.role !== "admin") return json(403, { error: "Only Owners and Admins can upload roster images." });
      let image;
      try { image = decodeDriverImage(payload.image); } catch (error) { return json(422, { error: error.message }); }
      const id = crypto.randomUUID();
      await store.set("driver-images/" + id, image.bytes, { metadata: { contentType: image.contentType } });
      return json(200, { url: "/.netlify/functions/admin-publish?image=" + id });
    }

    if (payload.action === "list-users") {
      if (user.role !== "owner") return json(403, { error: "Only the Owner can manage staff accounts." });
      const users = await store.get(USERS_KEY, { type: "json", consistency: "strong" }) || [];
      const audit = await store.get(AUDIT_KEY, { type: "json", consistency: "strong" }) || [];
      return json(200, { users: users.map(publicUser), audit: audit.slice(0, 30) });
    }

    if (payload.action === "create-user") {
      if (user.role !== "owner") return json(403, { error: "Only the Owner can create staff accounts." });
      const input = accountInput(payload);
      if (input.error) return json(422, { error: input.error });
      const users = await store.get(USERS_KEY, { type: "json", consistency: "strong" }) || [];
      if (users.some((item) => item.username === input.username)) return json(409, { error: "That username is already in use." });
      const created = { id: crypto.randomUUID(), username: input.username, displayName: input.displayName, role: input.role, active: true, createdAt: new Date().toISOString(), createdBy: user.displayName, lastLoginAt: null, ...await passwordRecord(input.password) };
      users.push(created);
      await store.setJSON(USERS_KEY, users);
      await addAudit(store, { type: "account_created", actorId: user.id, actorName: user.displayName, detail: `Created ${created.role} account @${created.username}` });
      return json(200, { ok: true, user: publicUser(created), message: `Account created for ${created.displayName}.` });
    }

    if (payload.action === "update-user") {
      if (user.role !== "owner") return json(403, { error: "Only the Owner can update staff accounts." });
      const users = await store.get(USERS_KEY, { type: "json", consistency: "strong" }) || [];
      const target = users.find((item) => item.id === payload.id);
      if (!target) return json(404, { error: "Account not found." });
      const username = cleanUsername(payload.username);
      const displayName = String(payload.displayName || "").trim().slice(0, 60);
      const role = String(payload.role || target.role);
      const active = Boolean(payload.active);
      if (!validUsername(username) || !displayName || !ROLES.has(role)) return json(422, { error: "Enter a valid username, display name, and role." });
      if (users.some((item) => item.id !== target.id && item.username === username)) return json(409, { error: "That username is already in use." });
      if (target.id === user.id && (!active || role !== "owner")) return json(422, { error: "You cannot deactivate or demote your own Owner account." });
      target.username = username; target.displayName = displayName; target.role = role; target.active = active;
      if (payload.password) {
        if (String(payload.password).length < 10) return json(422, { error: "New passwords must contain at least 10 characters." });
        Object.assign(target, await passwordRecord(String(payload.password)));
      }
      if (!users.some((item) => item.active && item.role === "owner")) return json(422, { error: "At least one active Owner account is required." });
      await store.setJSON(USERS_KEY, users);
      await addAudit(store, { type: "account_updated", actorId: user.id, actorName: user.displayName, detail: `Updated @${target.username} (${target.role}${target.active ? "" : ", disabled"})` });
      return json(200, { ok: true, user: publicUser(target), message: `Account updated for ${target.displayName}.` });
    }

    if (!validPayload(payload.data)) return json(422, { error: "The UARL dataset is incomplete or invalid." });
    const standingsIssues = validateStandings(payload.data);
    if (standingsIssues.length) return json(422, { error: standingsIssues[0] });
    const awardIssues = validateRaceBonuses(payload.data);
    if (awardIssues.length) {
      const issue = awardIssues[0], race = payload.data.records[issue.recordIndex];
      return json(422, { error: `${race.event || race.name || "Race"}: ${issue.message}` });
    }
    const current = await store.get(DATA_KEY, { type: "json", consistency: "strong" });
    if (user.role === "race_control" && !raceControlChangeOnly(payload.data, current && current.data)) {
      return json(403, { error: "Race Control accounts can publish schedule, results, and standings changes only." });
    }

    const publishedAt = new Date().toISOString();
    const record = {
      data: payload.data, publishedAt, revision: crypto.randomUUID(),
      note: String(payload.message || "Publish UARL website updates").slice(0, 120),
      publishedBy: publicUser(user), source: "netlify-blobs"
    };
    await store.setJSON(DATA_KEY, record);
    await addAudit(store, { type: "publish", actorId: user.id, actorName: user.displayName, detail: record.note, revision: record.revision });
    return json(200, { ok: true, publishedAt, revision: record.revision, message: `Published live by ${user.displayName}.` });
  } catch (error) {
    return json(502, { error: error.message || "The Admin service could not complete this request." });
  }
};

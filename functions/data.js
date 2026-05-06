// netlify/functions/data.js
// Handles GET/POST for site content, image uploads, and password verification.
// Storage: Netlify Blobs (free, automatic, no setup).

import { getStore } from "@netlify/blobs";

// === CONFIG ===
// Set this in Netlify dashboard: Site settings → Environment variables
// ADMIN_PASSWORD = your_chosen_password
// If not set, falls back to the default below (NOT secure — replace it).
const FALLBACK_PASSWORD = "1q2w3e4r5t";

const json = (status, body) => ({
  statusCode: status,
  headers: {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  },
  body: JSON.stringify(body),
});

const text = (status, body, type = "text/plain") => ({
  statusCode: status,
  headers: { "Content-Type": type, "Cache-Control": "no-store" },
  body,
});

// Constant-time-ish password compare (avoid trivial timing leaks)
function passwordsMatch(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || FALLBACK_PASSWORD;
}

// Sign-in tokens are just an HMAC of (timestamp + admin password).
// They expire after 12 hours. No external token library needed.
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 hours

import crypto from "crypto";

function makeToken() {
  const ts = Date.now().toString();
  const sig = crypto
    .createHmac("sha256", getAdminPassword())
    .update(ts)
    .digest("hex");
  return `${ts}.${sig}`;
}

function verifyToken(token) {
  if (!token || typeof token !== "string") return false;
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [ts, sig] = parts;
  const tsNum = parseInt(ts, 10);
  if (!tsNum || Date.now() - tsNum > TOKEN_TTL_MS) return false;
  const expected = crypto
    .createHmac("sha256", getAdminPassword())
    .update(ts)
    .digest("hex");
  return passwordsMatch(sig, expected);
}

function getAuthHeader(event) {
  const h = event.headers || {};
  return h["authorization"] || h["Authorization"] || "";
}

function isAuthorized(event) {
  const header = getAuthHeader(event);
  if (!header.startsWith("Bearer ")) return false;
  const token = header.slice(7).trim();
  return verifyToken(token);
}

export async function handler(event) {
  const method = event.httpMethod;
  const path = (event.path || "").replace(/^.*\/data/, "") || "/";

  try {
    // ===== Login =====
    if (method === "POST" && path === "/login") {
      const body = JSON.parse(event.body || "{}");
      if (passwordsMatch(body.password || "", getAdminPassword())) {
        return json(200, { token: makeToken(), ttlMs: TOKEN_TTL_MS });
      }
      return json(401, { error: "Invalid password" });
    }

    // ===== Verify token (used by client to know if cached token is still valid) =====
    if (method === "GET" && path === "/verify") {
      return json(200, { ok: isAuthorized(event) });
    }

    const contentStore = getStore("cccwc-content");
    const imagesStore = getStore("cccwc-images");

    // ===== Public read: site content =====
    if (method === "GET" && path === "/content") {
      const data = await contentStore.get("site", { type: "json" });
      return json(200, data || {});
    }

    // ===== Public read: a single image =====
    if (method === "GET" && path.startsWith("/image/")) {
      const id = decodeURIComponent(path.slice("/image/".length));
      if (!id) return text(400, "Missing image id");
      const meta = await imagesStore.getMetadata(id);
      const stream = await imagesStore.get(id, { type: "arrayBuffer" });
      if (!stream) return text(404, "Not found");
      const contentType =
        (meta && meta.metadata && meta.metadata.contentType) || "image/jpeg";
      return {
        statusCode: 200,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=300",
        },
        body: Buffer.from(stream).toString("base64"),
        isBase64Encoded: true,
      };
    }

    // ===== Authenticated: write content =====
    if (method === "POST" && path === "/content") {
      if (!isAuthorized(event)) return json(401, { error: "Unauthorized" });
      const body = JSON.parse(event.body || "{}");
      await contentStore.setJSON("site", body);
      return json(200, { ok: true });
    }

    // ===== Authenticated: upload image =====
    // Body: { id: "m-andresen", dataUrl: "data:image/jpeg;base64,..." }
    if (method === "POST" && path === "/image") {
      if (!isAuthorized(event)) return json(401, { error: "Unauthorized" });
      const body = JSON.parse(event.body || "{}");
      const { id, dataUrl } = body;
      if (!id || !dataUrl) return json(400, { error: "Missing id or dataUrl" });

      const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
      if (!m) return json(400, { error: "Invalid data URL" });
      const contentType = m[1];
      const buf = Buffer.from(m[2], "base64");
      // Hard cap at 2 MB per image (after compression)
      if (buf.length > 2 * 1024 * 1024)
        return json(413, { error: "Image too large (>2MB)" });

      await imagesStore.set(id, buf, { metadata: { contentType } });
      return json(200, { ok: true, size: buf.length });
    }

    // ===== Authenticated: delete image =====
    if (method === "DELETE" && path.startsWith("/image/")) {
      if (!isAuthorized(event)) return json(401, { error: "Unauthorized" });
      const id = decodeURIComponent(path.slice("/image/".length));
      await imagesStore.delete(id);
      return json(200, { ok: true });
    }

    // ===== List image ids (public read so the page can show what's available) =====
    if (method === "GET" && path === "/images") {
      const list = await imagesStore.list();
      return json(200, { keys: (list.blobs || []).map((b) => b.key) });
    }

    return json(404, { error: "Not found", path, method });
  } catch (err) {
    console.error("Function error:", err);
    return json(500, { error: err.message || "Server error" });
  }
}

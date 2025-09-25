// File: api/events.js  (Node 18 runtime)

export default async function handler(req, res) {
  const { method } = req;
  const headers = req.headers || {};
  const origin = headers.origin || "*";

  // --- CORS pre-flight ---
  if (method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, Events-Webhook-Secret"
    );
    return res.status(200).end();
  }

  // --- Health check ---
  if (method === "GET") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    return res.status(200).json({ status: "ok" });
  }

  if (method !== "POST") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // ---- Auth (accept custom header OR Bearer token) ----
    const secret = (process.env.EVENTS_WEBHOOK_SECRET || "").trim();

    // Node/Vercel lower-case header names:
    const bearer = (headers.authorization || "").startsWith("Bearer ")
      ? headers.authorization.slice(7).trim()
      : "";

    const provided =
      (headers["events-webhook-secret"] || "").trim() || bearer;

    if (!provided || provided !== secret) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      return res.status(401).json({ error: "Invalid secret" });
    }

    // ---- Parse request ----
    const body = await readJson(req);

    // ---- Build Google Form payload ----
    const map = JSON.parse(process.env.FORM_ENTRY_MAP_JSON || "{}");
    const form = new URLSearchParams();

    // Plain fields
    for (const [key, entryId] of Object.entries(map)) {
      if (key.endsWith("_year") || key.endsWith("_month") || key.endsWith("_day")) continue;
      if (body[key] !== undefined && entryId) form.append(entryId, body[key]);
    }

    // Date helpers (expects ISO yyyy-mm-dd)
    handleDate("date", body.date);
    handleDate("deadline", body.deadline);

    // ---- Send to Google Form ----
    const gRes = await fetch(process.env.FORM_ACTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form
    });

    if (!gRes.ok) {
      const text = await gRes.text().catch(() => "");
      throw new Error(`Google Form error ${gRes.status}${text ? ` – ${text}` : ""}`);
    }

    res.setHeader("Access-Control-Allow-Origin", origin);
    return res.status(200).json({ ok: true });

    // ---- Helpers ----
    function handleDate(label, iso) {
      if (!iso) return;
      const [y, m, d] = String(iso).split("-");
      if (map[`${label}_year`])  form.append(map[`${label}_year`],  y);
      if (map[`${label}_month`]) form.append(map[`${label}_month`], Number(m));
      if (map[`${label}_day`])   form.append(map[`${label}_day`],   Number(d));
    }
  } catch (err) {
    console.error(err);
    res.setHeader("Access-Control-Allow-Origin", origin);
    return res.status(500).json({ error: err.message || "Internal error" });
  }
}

// Helper: read body once
function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", c => (data += c));
    req.on("end", () => {
      try {
        resolve(JSON.parse(data || "{}"));
      } catch (e) {
        reject(e);
      }
    });
  });
}


// File: api/events.js  (Node 18 runtime)

export default async function handler(req, res) {
  const { method, headers } = req;
  const origin = headers.origin || "*";

  // --- CORS pre-flight ---
  if (method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers",
      "Content-Type, Authorization, Events-Webhook-Secret");
    return res.status(200).end();
  }

  // --- Health check ---
  if (method === "GET") {
    return res.status(200).json({ status: "ok" });
  }

  if (method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // Auth
    if (headers["events-webhook-secret"] !== process.env.EVENTS_WEBHOOK_SECRET) {
      return res.status(401).json({ error: "Invalid secret" });
    }

    const body = await readJson(req);
    const map  = JSON.parse(process.env.FORM_ENTRY_MAP_JSON || "{}");
    const form = new URLSearchParams();

    // Plain fields
    for (const [key, entryId] of Object.entries(map)) {
      if (key.endsWith("_year") || key.endsWith("_month") || key.endsWith("_day")) continue;
      if (body[key] !== undefined) form.append(entryId, body[key]);
    }

    // Date helpers
    handleDate("date", body.date);
    handleDate("deadline", body.deadline);

    // Send to Google Form
    const gRes = await fetch(process.env.FORM_ACTION_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form
    });
    if (!gRes.ok) throw new Error(`Google Form error ${gRes.status}`);

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message || "Internal error" });
  }

  function handleDate(label, iso) {
    if (!iso) return;
    const [y, m, d] = iso.split("-");
    form.append(map[`${label}_year`],  y);
    form.append(map[`${label}_month`], Number(m));
    form.append(map[`${label}_day`],   Number(d));
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", c => (data += c));
    req.on("end", () => {
      try { resolve(JSON.parse(data || "{}")); }
      catch (e) { reject(e); }
    });
  });
}

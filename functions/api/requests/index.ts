export interface Env { DB: D1Database; }

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  let body: any;
  try { body = await request.json(); } catch { return json({ ok: false, error: "Invalid JSON" }, 400); }

  const campaignSlug = String(body?.campaignSlug ?? "").trim() || null;
  const name = String(body?.name ?? "").trim();
  const email = String(body?.email ?? "").trim();
  const message = String(body?.message ?? "").trim();

  if (!name || !email) return json({ ok: false, error: "Name and email required." }, 400);

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();

  await env.DB.prepare(
    `INSERT INTO requests (id, campaign_slug, name, email, message, created_at) VALUES (?, ?, ?, ?, ?, ?)`
  ).bind(id, campaignSlug, name, email, message, createdAt).run();

  return json({ ok: true, id });
};

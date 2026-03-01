export interface Env {
  DB: D1Database;
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

const bad = (error: string, status = 400) => json({ ok: false, error }, status);

const nowISO = () => new Date().toISOString();

const slugify = (input: string) =>
  (input || "")
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  const url = new URL(request.url);

  // GET /api/campaigns?status=published|draft|archived|all
  if (request.method === "GET") {
    const status = (url.searchParams.get("status") || "published").toLowerCase();
    const where = status === "all" ? "" : "WHERE status = ?";

    const stmt = env.DB.prepare(`
      SELECT slug, title, status, system, day, time, mode, seats_open, seats_total, price, thumb, hook, blurb, tags_json, updated_at
      FROM campaigns
      ${where}
      ORDER BY updated_at DESC
    `);

    const res = status === "all" ? await stmt.all() : await stmt.bind(status).all();

    const campaigns = (res.results || []).map((r: any) => ({
      slug: r.slug,
      title: r.title,
      status: r.status,
      system: r.system,
      day: r.day,
      time: r.time,
      mode: r.mode,
      seatsOpen: r.seats_open ?? 0,
      seatsTotal: r.seats_total ?? 0,
      price: r.price,
      thumb: r.thumb,
      hook: r.hook,
      blurb: r.blurb,
      tags: r.tags_json ? JSON.parse(r.tags_json) : [],
      updatedAt: r.updated_at,
    }));

    return json({ ok: true, campaigns });
  }

  // POST /api/campaigns  (upsert, expects builder payload)
  if (request.method === "POST") {
    let body: any;
    try {
      body = await request.json();
    } catch {
      return bad("Invalid JSON body.");
    }

    const data = body?.data ?? body;
    const title = String(data?.basic?.title ?? body?.title ?? "").trim();
    if (!title) return bad("Title is required.");

    const slug = slugify(body?.slug ?? data?.slug ?? title);
    if (!slug) return bad("Unable to generate slug.");

    const status = String(body?.status ?? data?.status ?? "published").toLowerCase();
    const safeStatus = ["draft", "published", "archived"].includes(status) ? status : "draft";

    const system = String(data?.basic?.system ?? "").trim() || null;

    // If you want day/time split later, store them separately in builder.
    const day = String(data?.booking?.day ?? "").trim() || null;
    const time = String(data?.booking?.time ?? "").trim() || null;

    const schedule = String(data?.booking?.schedule ?? "").trim();

    const seatsOpen = Number(data?.booking?.seatsOpen ?? 0) || 0;
    const seatsTotal = Number(data?.booking?.seatsTotal ?? 0) || 0;
    const mode = seatsOpen > 0 ? "open" : "full";

    const price = String(data?.pricing?.price ?? "").trim() || null;
    const thumb = String(data?.image?.path ?? "").trim() || null;
    const hook = String(data?.basic?.hook ?? "").trim() || null;
    const blurb = String(data?.basic?.hook ?? "").trim() || null;

    const tags = Array.isArray(data?.basic?.themes) ? data.basic.themes.slice(0, 12) : [];
    const tagsJson = JSON.stringify(tags);

    const createdAt = nowISO();
    const updatedAt = createdAt;

    const dataJson = JSON.stringify({
      ...data,
      slug,
      status: safeStatus,
      booking: { ...(data.booking || {}), schedule },
    });

    await env.DB.prepare(`
      INSERT INTO campaigns (
        slug, title, status, system, day, time, mode,
        seats_open, seats_total, price, thumb, hook, blurb,
        tags_json, data_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET
        title=excluded.title,
        status=excluded.status,
        system=excluded.system,
        day=excluded.day,
        time=excluded.time,
        mode=excluded.mode,
        seats_open=excluded.seats_open,
        seats_total=excluded.seats_total,
        price=excluded.price,
        thumb=excluded.thumb,
        hook=excluded.hook,
        blurb=excluded.blurb,
        tags_json=excluded.tags_json,
        data_json=excluded.data_json,
        updated_at=excluded.updated_at
    `).bind(
      slug, title, safeStatus, system, day, time, mode,
      seatsOpen, seatsTotal, price, thumb, hook, blurb,
      tagsJson, dataJson, createdAt, updatedAt
    ).run();

    return json({ ok: true, slug, status: safeStatus });
  }

  return bad("Method not allowed.", 405);
};

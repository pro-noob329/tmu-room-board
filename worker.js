const ALLOWED_PLACES = new Set([
  ...["101", "104", "105", "106", "110", "121", "151", "152"].map((room) => `6-${room}`),
  ...["201", "202", "203", "204", "205", "206", "207", "208", "209", "210", "211", "212", "213"].map((room) => `6-${room}`),
  ...["301", "302", "303", "304", "305", "306", "307", "308", "309", "310", "311", "312", "313"].map((room) => `6-${room}`),
  ...["401", "402", "403", "404"].map((room) => `6-${room}`),
  "8-1-library", "8-1-lounge", "8-3-library", "8-3-nine", "8-4-library",
  "8-4-nine", "8-5-library", "8-5-nine", "8-6-library", "8-6-nine",
]);

const ALLOWED_TAGS = new Set(["人が少ない", "自習者あり", "授業準備っぽい", "静か", "空調ON", "暑い", "寒い", "混んできた"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/state" && request.method === "GET") {
        const clientId = clean(url.searchParams.get("clientId"), 80);
        await touchAndClean(env.DB, clientId);
        return json(await publicState(env.DB, clientId));
      }

      if (url.pathname === "/api/action" && request.method === "POST") {
        const body = await request.json();
        await applyAction(env.DB, body);
        return json(await publicState(env.DB, clean(body.clientId, 80)));
      }

      return env.ASSETS.fetch(request);
    } catch (error) {
      return json({ error: error.message || "処理に失敗しました" }, 400);
    }
  },
};

function tokyoNow() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    day: `${values.year}-${values.month}-${values.day}`,
    hour: Number(values.hour),
    now: new Date().toISOString(),
    cutoff: new Date(Date.now() - 45000).toISOString(),
  };
}

function clean(value, maxLength) {
  return String(value || "").trim().slice(0, maxLength);
}

async function touchAndClean(db, clientId) {
  const time = tokyoNow();
  const statements = [
    db.prepare("DELETE FROM reports WHERE day != ?").bind(time.day),
    db.prepare("DELETE FROM memos WHERE day != ?").bind(time.day),
    db.prepare("DELETE FROM presence WHERE seen_at < ?").bind(time.cutoff),
    db.prepare("DELETE FROM stays WHERE seen_at < ?").bind(time.cutoff),
  ];
  if (clientId) {
    statements.push(db.prepare("INSERT INTO presence (client_id, seen_at) VALUES (?, ?) ON CONFLICT(client_id) DO UPDATE SET seen_at = excluded.seen_at").bind(clientId, time.now));
  }
  await db.batch(statements);
  return time;
}

async function applyAction(db, body) {
  const clientId = clean(body.clientId, 80);
  const placeId = clean(body.placeId, 80);
  const action = clean(body.action, 20);
  if (!clientId) throw new Error("利用者情報がありません");
  const time = await touchAndClean(db, clientId);

  if (action === "heartbeat") {
    await db.prepare("UPDATE stays SET seen_at = ? WHERE client_id = ?").bind(time.now, clientId).run();
    return;
  }

  if (time.hour < 5) throw new Error("0:00-5:00は投稿できません");
  if (!ALLOWED_PLACES.has(placeId)) throw new Error("存在しない場所です");

  if (["free", "shared", "busy"].includes(action)) {
    const counter = action === "free" ? "free_reports" : action === "shared" ? "shared_reports" : "busy_reports";
    await db.prepare(`
      INSERT INTO reports (place_id, day, status, ${counter}, updated_at)
      VALUES (?, ?, ?, 1, ?)
      ON CONFLICT(place_id, day) DO UPDATE SET
        status = excluded.status,
        ${counter} = ${counter} + 1,
        updated_at = excluded.updated_at
    `).bind(placeId, time.day, action, time.now).run();
    return;
  }

  if (action === "stay") {
    await db.batch([
      db.prepare("INSERT INTO stays (place_id, client_id, seen_at) VALUES (?, ?, ?) ON CONFLICT(place_id, client_id) DO UPDATE SET seen_at = excluded.seen_at").bind(placeId, clientId, time.now),
      db.prepare(`
        INSERT INTO reports (place_id, day, status, updated_at) VALUES (?, ?, 'free', ?)
        ON CONFLICT(place_id, day) DO UPDATE SET status = 'free', updated_at = excluded.updated_at
      `).bind(placeId, time.day, time.now),
    ]);
    return;
  }

  if (action === "leave") {
    await db.prepare("DELETE FROM stays WHERE place_id = ? AND client_id = ?").bind(placeId, clientId).run();
    return;
  }

  if (action === "memo") {
    const text = clean(body.text, 160);
    const tags = Array.isArray(body.tags) ? body.tags.map((tag) => clean(tag, 30)).filter((tag) => ALLOWED_TAGS.has(tag)).slice(0, 6) : [];
    if (!text && tags.length === 0) throw new Error("メモが空です");
    await db.prepare("INSERT INTO memos (place_id, day, text, tags, created_at) VALUES (?, ?, ?, ?, ?)").bind(placeId, time.day, text, JSON.stringify(tags), time.now).run();
    await db.prepare(`
      INSERT INTO reports (place_id, day, status, updated_at) VALUES (?, ?, 'unknown', ?)
      ON CONFLICT(place_id, day) DO UPDATE SET updated_at = excluded.updated_at
    `).bind(placeId, time.day, time.now).run();
    return;
  }

  throw new Error("不明な操作です");
}

async function publicState(db, clientId) {
  const time = await touchAndClean(db, clientId);
  const [reportsResult, staysResult, myStaysResult, memosResult, onlineResult] = await Promise.all([
    db.prepare("SELECT place_id, status, free_reports, shared_reports, busy_reports, updated_at FROM reports WHERE day = ?").bind(time.day).all(),
    db.prepare("SELECT place_id, COUNT(*) AS staying FROM stays WHERE seen_at >= ? GROUP BY place_id").bind(time.cutoff).all(),
    db.prepare("SELECT place_id FROM stays WHERE client_id = ? AND seen_at >= ?").bind(clientId, time.cutoff).all(),
    db.prepare("SELECT place_id, text, tags, created_at FROM memos WHERE day = ? ORDER BY created_at DESC").bind(time.day).all(),
    db.prepare("SELECT COUNT(*) AS count FROM presence WHERE seen_at >= ?").bind(time.cutoff).first(),
  ]);

  const reports = {};
  for (const row of reportsResult.results) {
    reports[row.place_id] = {
      status: row.status,
      freeReports: row.free_reports,
      sharedReports: row.shared_reports,
      busyReports: row.busy_reports,
      updatedAt: row.updated_at,
      staying: 0,
      myStay: false,
      memos: [],
    };
  }

  for (const row of staysResult.results) {
    reports[row.place_id] ||= emptyReport();
    reports[row.place_id].staying = row.staying;
  }
  for (const row of myStaysResult.results) {
    reports[row.place_id] ||= emptyReport();
    reports[row.place_id].myStay = true;
  }
  for (const row of memosResult.results) {
    reports[row.place_id] ||= emptyReport();
    if (reports[row.place_id].memos.length < 5) {
      reports[row.place_id].memos.push({
        text: row.text,
        tags: JSON.parse(row.tags || "[]"),
        at: row.created_at,
      });
    }
  }

  return { day: time.day, reports, onlineUsers: onlineResult?.count || 0, closed: time.hour < 5 };
}

function emptyReport() {
  return { status: "unknown", freeReports: 0, sharedReports: 0, busyReports: 0, updatedAt: null, staying: 0, myStay: false, memos: [] };
}

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    },
  });
}

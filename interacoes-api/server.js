import crypto from "node:crypto";
import express from "express";
import helmet from "helmet";
import pg from "pg";

const app = express(), port = Number(process.env.PORT || 3000);
const allowedOrigins = new Set(["https://vmgames.com.br", "https://www.vmgames.com.br", ...(process.env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean)]);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined, max: 5 });

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "12kb" }));
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && allowedOrigins.has(origin)) { res.set("Access-Control-Allow-Origin", origin); res.set("Vary", "Origin"); }
  res.set("Access-Control-Allow-Methods", "GET, POST, PATCH, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return origin && allowedOrigins.has(origin) ? res.sendStatus(204) : res.sendStatus(403);
  if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ erro: "Origem não autorizada" });
  next();
});

const attempts = new Map(), loginAttempts = new Map();
function limitWindow(store, key, maximum, windowMs) { const now = Date.now(), recent = (store.get(key) || []).filter(t => now - t < windowMs); if (recent.length >= maximum) return false; recent.push(now); store.set(key, recent); return true; }
function rateLimit(req, res, next) { if (!limitWindow(attempts, req.ip || "desconhecido", 12, 60_000)) return res.status(429).json({ erro: "Muitas tentativas. Aguarde um minuto." }); next(); }
function pageKey(value) { const key = String(value || "").trim().toLowerCase(); return /^(blog|noticia:[a-z0-9-]{1,100})$/.test(key) ? key : null; }
function cleanText(value, max) { return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function visitorHash(req, visitor) { return crypto.createHmac("sha256", process.env.HASH_SECRET || "vmgames-local").update(`${visitor}|${req.ip}`).digest("hex"); }
function safeEqual(left, right) { const a = Buffer.from(String(left)), b = Buffer.from(String(right)); return a.length === b.length && crypto.timingSafeEqual(a, b); }
function verifyPassword(password, stored) { const [algorithm, salt, expected] = String(stored || "").split("$"); if (algorithm !== "scrypt" || !salt || !/^[a-f0-9]{128}$/i.test(expected || "")) return false; return safeEqual(crypto.scryptSync(String(password || ""), salt, 64).toString("hex"), expected); }
function tokenSecret() { return process.env.ADMIN_SESSION_SECRET || ""; }
function makeToken(username) { const payload = Buffer.from(JSON.stringify({ sub: username, exp: Date.now() + 4 * 60 * 60 * 1000 })).toString("base64url"), signature = crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url"); return `${payload}.${signature}`; }
function requireAdmin(req, res, next) {
  if (!tokenSecret()) return res.status(503).json({ erro: "Painel ainda não configurado." });
  const token = String(req.get("authorization") || "").replace(/^Bearer\s+/i, ""), [payload, signature] = token.split(".");
  if (!payload || !signature) return res.status(401).json({ erro: "Sessão inválida." });
  const expected = crypto.createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  if (!safeEqual(signature, expected)) return res.status(401).json({ erro: "Sessão inválida." });
  try { const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")); if (data.exp <= Date.now() || !safeEqual(data.sub, process.env.ADMIN_USERNAME || "")) throw new Error(); req.admin = data.sub; next(); }
  catch { return res.status(401).json({ erro: "Sessão expirada. Entre novamente." }); }
}

async function initialize() { await pool.query(`CREATE TABLE IF NOT EXISTS likes (page_key varchar(110) NOT NULL, visitor_hash char(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (page_key, visitor_hash)); CREATE TABLE IF NOT EXISTS comments (id bigserial PRIMARY KEY, page_key varchar(110) NOT NULL, name varchar(50) NOT NULL, body varchar(1000) NOT NULL, status varchar(12) NOT NULL DEFAULT 'approved', created_at timestamptz NOT NULL DEFAULT now(), ip_hash char(64) NOT NULL); CREATE INDEX IF NOT EXISTS comments_page_status_date ON comments(page_key, status, created_at DESC); CREATE TABLE IF NOT EXISTS visits (page_path varchar(240) NOT NULL, visitor_hash char(64) NOT NULL, visit_date date NOT NULL DEFAULT CURRENT_DATE, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(page_path, visitor_hash, visit_date)); CREATE INDEX IF NOT EXISTS visits_date_page ON visits(visit_date DESC, page_path); DELETE FROM visits WHERE page_path='/teste-dashboard';`); }

app.get("/health", async (_req, res) => { await pool.query("SELECT 1"); res.json({ ok: true }); });
app.get("/", (_req, res) => res.json({ servico: "VM Games Comunidade", status: "online" }));
app.get("/v1/interactions", async (req, res) => { const key = pageKey(req.query.page); if (!key) return res.status(400).json({ erro: "Página inválida" }); const [likes, comments] = await Promise.all([pool.query("SELECT count(*)::int AS total FROM likes WHERE page_key=$1", [key]), pool.query("SELECT id, name, body, created_at FROM comments WHERE page_key=$1 AND status='approved' ORDER BY created_at DESC LIMIT 50", [key])]); res.set("Cache-Control", "public, max-age=15"); res.json({ likes: likes.rows[0].total, comments: comments.rows }); });
app.post("/v1/likes", rateLimit, async (req, res) => { const key = pageKey(req.body.page), visitor = String(req.body.visitor || ""); if (!key || !/^[a-f0-9-]{20,80}$/i.test(visitor)) return res.status(400).json({ erro: "Dados inválidos" }); const hash = visitorHash(req, visitor), inserted = await pool.query("INSERT INTO likes(page_key, visitor_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING page_key", [key, hash]), count = await pool.query("SELECT count(*)::int AS total FROM likes WHERE page_key=$1", [key]); res.status(inserted.rowCount ? 201 : 200).json({ liked: true, likes: count.rows[0].total }); });
app.post("/v1/comments", rateLimit, async (req, res) => { const key = pageKey(req.body.page), name = cleanText(req.body.name, 50), body = cleanText(req.body.body, 1000), website = cleanText(req.body.website, 200); if (website) return res.status(202).json({ ok: true }); if (!key || name.length < 2 || body.length < 3) return res.status(400).json({ erro: "Preencha nome e comentário." }); const result = await pool.query("INSERT INTO comments(page_key, name, body, ip_hash) VALUES($1,$2,$3,$4) RETURNING id, name, body, created_at", [key, name, body, visitorHash(req, "comment")]); res.status(201).json({ ok: true, comment: result.rows[0] }); });
app.post("/v1/visits", rateLimit, async (req, res) => { const path = cleanText(req.body.path, 240), visitor = String(req.body.visitor || ""); if (!/^\/[a-z0-9/_\-.]*$/i.test(path) || path.startsWith("/admin") || !/^[a-f0-9-]{20,80}$/i.test(visitor)) return res.status(400).json({ erro: "Visita inválida." }); const hash = visitorHash(req, visitor), result = await pool.query("INSERT INTO visits(page_path, visitor_hash) VALUES($1,$2) ON CONFLICT DO NOTHING", [path || "/", hash]); res.sendStatus(result.rowCount ? 201 : 204); });

app.post("/v1/admin/login", (req, res) => { const key = req.ip || "desconhecido"; if (!limitWindow(loginAttempts, key, 5, 15 * 60_000)) return res.status(429).json({ erro: "Muitas tentativas. Aguarde 15 minutos." }); if (!process.env.ADMIN_USERNAME || !process.env.ADMIN_PASSWORD_HASH || !tokenSecret()) return res.status(503).json({ erro: "Painel ainda não configurado." }); if (!safeEqual(cleanText(req.body.username, 80), process.env.ADMIN_USERNAME) || !verifyPassword(req.body.password, process.env.ADMIN_PASSWORD_HASH)) return res.status(401).json({ erro: "Usuário ou senha incorretos." }); loginAttempts.delete(key); res.set("Cache-Control", "no-store"); res.json({ token: makeToken(process.env.ADMIN_USERNAME), expiresIn: 14400 }); });
app.get("/v1/admin/summary", requireAdmin, async (_req, res) => { const result = await pool.query(`SELECT (SELECT count(*)::int FROM likes) AS likes, (SELECT count(*)::int FROM comments WHERE status='approved') AS approved, (SELECT count(*)::int FROM comments WHERE status='hidden') AS hidden, (SELECT count(DISTINCT page_key)::int FROM comments) AS pages`); res.set("Cache-Control", "no-store"); res.json(result.rows[0]); });
app.get("/v1/admin/analytics", requireAdmin, async (_req, res) => { const [totals, daily, top] = await Promise.all([pool.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE visit_date=CURRENT_DATE)::int AS today, count(*) FILTER (WHERE visit_date>=CURRENT_DATE-6)::int AS seven_days, count(*) FILTER (WHERE visit_date>=CURRENT_DATE-29)::int AS thirty_days, count(DISTINCT visitor_hash) FILTER (WHERE visit_date>=CURRENT_DATE-29)::int AS unique_thirty_days FROM visits`), pool.query(`SELECT day::date, coalesce(count(v.page_path),0)::int AS visits FROM generate_series(CURRENT_DATE-13,CURRENT_DATE,'1 day') day LEFT JOIN visits v ON v.visit_date=day GROUP BY day ORDER BY day`), pool.query(`SELECT page_path, count(*)::int AS visits FROM visits WHERE visit_date>=CURRENT_DATE-29 GROUP BY page_path ORDER BY visits DESC, page_path LIMIT 10`)]); res.set("Cache-Control", "no-store"); res.json({ totals: totals.rows[0], daily: daily.rows, topPages: top.rows }); });
app.get("/v1/admin/comments", requireAdmin, async (req, res) => { const status = String(req.query.status || "all"); if (!["all", "approved", "hidden"].includes(status)) return res.status(400).json({ erro: "Filtro inválido." }); const values = [], where = status === "all" ? "" : "WHERE status=$1"; if (where) values.push(status); const result = await pool.query(`SELECT id, page_key, name, body, status, created_at FROM comments ${where} ORDER BY created_at DESC LIMIT 100`, values); res.set("Cache-Control", "no-store"); res.json({ comments: result.rows }); });
app.patch("/v1/admin/comments/:id", requireAdmin, async (req, res) => { const id = Number(req.params.id), status = String(req.body.status || ""); if (!Number.isSafeInteger(id) || id < 1 || !["approved", "hidden"].includes(status)) return res.status(400).json({ erro: "Alteração inválida." }); const result = await pool.query("UPDATE comments SET status=$1 WHERE id=$2 RETURNING id, status", [status, id]); if (!result.rowCount) return res.status(404).json({ erro: "Comentário não encontrado." }); res.json({ ok: true, comment: result.rows[0] }); });

app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ erro: "Não foi possível concluir agora." }); });
initialize().then(() => app.listen(port, "0.0.0.0", () => console.log(`API na porta ${port}`)));

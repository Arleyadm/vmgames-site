import crypto from "node:crypto";
import express from "express";
import helmet from "helmet";
import pg from "pg";

const app = express();
const port = Number(process.env.PORT || 3000);
const allowedOrigins = new Set(["https://vmgames.com.br", "https://www.vmgames.com.br", ...(process.env.ALLOWED_ORIGINS || "").split(",").map(x => x.trim()).filter(Boolean)]);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined, max: 5 });

app.set("trust proxy", 1);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(express.json({ limit: "12kb" }));
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && allowedOrigins.has(origin)) { res.set("Access-Control-Allow-Origin", origin); res.set("Vary", "Origin"); }
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return origin && allowedOrigins.has(origin) ? res.sendStatus(204) : res.sendStatus(403);
  if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ erro: "Origem não autorizada" });
  next();
});

const attempts = new Map();
function rateLimit(req, res, next) {
  const key = req.ip || "desconhecido", now = Date.now();
  const recent = (attempts.get(key) || []).filter(t => now - t < 60_000);
  if (recent.length >= 12) return res.status(429).json({ erro: "Muitas tentativas. Aguarde um minuto." });
  recent.push(now); attempts.set(key, recent); next();
}
function pageKey(value) { const key = String(value || "").trim().toLowerCase(); return /^(blog|noticia:[a-z0-9-]{1,100})$/.test(key) ? key : null; }
function cleanText(value, max) { return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max); }
function visitorHash(req, visitor) { return crypto.createHmac("sha256", process.env.HASH_SECRET || "vmgames-local").update(`${visitor}|${req.ip}`).digest("hex"); }

async function initialize() {
  await pool.query(`CREATE TABLE IF NOT EXISTS likes (page_key varchar(110) NOT NULL, visitor_hash char(64) NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY (page_key, visitor_hash));
    CREATE TABLE IF NOT EXISTS comments (id bigserial PRIMARY KEY, page_key varchar(110) NOT NULL, name varchar(50) NOT NULL, body varchar(1000) NOT NULL, status varchar(12) NOT NULL DEFAULT 'approved', created_at timestamptz NOT NULL DEFAULT now(), ip_hash char(64) NOT NULL);
    CREATE INDEX IF NOT EXISTS comments_page_status_date ON comments(page_key, status, created_at DESC);`);
}

app.get("/health", async (_req, res) => { await pool.query("SELECT 1"); res.json({ ok: true }); });
app.get("/v1/interactions", async (req, res) => {
  const key = pageKey(req.query.page); if (!key) return res.status(400).json({ erro: "Página inválida" });
  const [likes, comments] = await Promise.all([pool.query("SELECT count(*)::int AS total FROM likes WHERE page_key=$1", [key]), pool.query("SELECT id, name, body, created_at FROM comments WHERE page_key=$1 AND status='approved' ORDER BY created_at DESC LIMIT 50", [key])]);
  res.set("Cache-Control", "public, max-age=15"); res.json({ likes: likes.rows[0].total, comments: comments.rows });
});
app.post("/v1/likes", rateLimit, async (req, res) => {
  const key = pageKey(req.body.page), visitor = String(req.body.visitor || "");
  if (!key || !/^[a-f0-9-]{20,80}$/i.test(visitor)) return res.status(400).json({ erro: "Dados inválidos" });
  const hash = visitorHash(req, visitor);
  const inserted = await pool.query("INSERT INTO likes(page_key, visitor_hash) VALUES($1,$2) ON CONFLICT DO NOTHING RETURNING page_key", [key, hash]);
  const count = await pool.query("SELECT count(*)::int AS total FROM likes WHERE page_key=$1", [key]);
  res.status(inserted.rowCount ? 201 : 200).json({ liked: true, likes: count.rows[0].total });
});
app.post("/v1/comments", rateLimit, async (req, res) => {
  const key = pageKey(req.body.page), name = cleanText(req.body.name, 50), body = cleanText(req.body.body, 1000), website = cleanText(req.body.website, 200);
  if (website) return res.status(202).json({ ok: true });
  if (!key || name.length < 2 || body.length < 3) return res.status(400).json({ erro: "Preencha nome e comentário." });
  const result = await pool.query("INSERT INTO comments(page_key, name, body, ip_hash) VALUES($1,$2,$3,$4) RETURNING id, name, body, created_at", [key, name, body, visitorHash(req, "comment")]);
  res.status(201).json({ ok: true, comment: result.rows[0] });
});
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ erro: "Não foi possível concluir agora." }); });
initialize().then(() => app.listen(port, "0.0.0.0", () => console.log(`API na porta ${port}`)));

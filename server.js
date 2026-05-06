const express = require("express");
const cors = require("cors");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "exalt_secret_change_this";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Rehan789$$";
const DB_FILE = "database.json";

function defaultDb() {
  return { users: [], wallets: [], mining: [], referrals: [], orders: [] };
}

function readDb() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb(), null, 2));
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function nextId(arr) {
  return arr.length ? Math.max(...arr.map(x => Number(x.id || 0))) + 1 : 1;
}

function token(user) {
  return jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn: "30d" });
}

function auth(req, res, next) {
  try {
    const h = req.headers.authorization || "";
    const t = h.startsWith("Bearer ") ? h.slice(7) : "";
    const data = jwt.verify(t, JWT_SECRET);
    const db = readDb();
    const user = db.users.find(u => u.id === data.id);
    if (!user) return res.status(401).json({ error: "User not found" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}

function wallet(db, userId) {
  let w = db.wallets.find(x => x.userId === userId);
  if (!w) {
    w = { id: nextId(db.wallets), userId, USDT: 10000, EXALT: 0, BNB: 0 };
    db.wallets.push(w);
  }
  return w;
}

function publicUser(u) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    kycStatus: u.kycStatus,
    vip: u.vip,
    referralCode: u.referralCode
  };
}

app.get("/", (req, res) => {
  res.send("Exalt Exchange Backend Running");
});

app.get("/status", (req, res) => {
  res.json({ ok: true, status: "running", exchange: "Exalt Exchange", phase: "next-phase" });
});

app.post("/register", async (req, res) => {
  const { name, email, password, referralCode } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const db = readDb();
  if (db.users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
    return res.status(400).json({ error: "Email already exists" });
  }

  const user = {
    id: nextId(db.users),
    name: name || "User",
    email,
    passwordHash: await bcrypt.hash(password, 10),
    kycStatus: "not_submitted",
    vip: "free",
    referralCode: "EXALT" + Math.floor(100000 + Math.random() * 900000),
    referredBy: referralCode || null,
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  wallet(db, user.id);

  if (referralCode) {
    const referrer = db.users.find(u => u.referralCode === referralCode);
    if (referrer) {
      db.referrals.push({
        id: nextId(db.referrals),
        referrerId: referrer.id,
        referredUserId: user.id,
        rewardEXALT: 10,
        status: "pending",
        createdAt: new Date().toISOString()
      });
    }
  }

  writeDb(db);
  res.json({ ok: true, token: token(user), user: publicUser(user), wallet: wallet(db, user.id) });
});

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const db = readDb();
  const user = db.users.find(u => u.email.toLowerCase() === String(email || "").toLowerCase());
  if (!user) return res.status(401).json({ error: "Invalid login" });

  const ok = await bcrypt.compare(password || "", user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid login" });

  res.json({ ok: true, token: token(user), user: publicUser(user), wallet: wallet(db, user.id) });
});

app.get("/profile", auth, (req, res) => {
  const db = readDb();
  res.json({ user: publicUser(req.user), wallet: wallet(db, req.user.id) });
});

app.get("/wallet", auth, (req, res) => {
  const db = readDb();
  res.json({ wallet: wallet(db, req.user.id) });
});

app.post("/kyc/submit", auth, (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.user.id);
  user.kycStatus = "pending";
  user.kyc = {
    fullName: req.body.fullName || "",
    country: req.body.country || "",
    documentType: req.body.documentType || "",
    submittedAt: new Date().toISOString()
  };
  writeDb(db);
  res.json({ ok: true, kycStatus: user.kycStatus });
});

app.post("/admin/kyc/approve", (req, res) => {
  const { userId, adminPassword } = req.body;
  if (adminPassword !== ADMIN_PASSWORD) return res.status(403).json({ error: "Invalid admin password" });

  const db = readDb();
  const user = db.users.find(u => u.id === Number(userId));
  if (!user) return res.status(404).json({ error: "User not found" });

  user.kycStatus = "approved";
  writeDb(db);
  res.json({ ok: true, user: publicUser(user) });
});

app.post("/mining/start", auth, (req, res) => {
  const db = readDb();
  let m = db.mining.find(x => x.userId === req.user.id);
  if (!m) {
    m = { id: nextId(db.mining), userId: req.user.id, status: "active", startedAt: Date.now(), totalClaimed: 0 };
    db.mining.push(m);
  } else {
    m.status = "active";
    m.startedAt = Date.now();
  }
  writeDb(db);
  res.json({ ok: true, mining: m });
});

app.get("/mining/status", auth, (req, res) => {
  const db = readDb();
  const m = db.mining.find(x => x.userId === req.user.id);
  if (!m || m.status !== "active") return res.json({ status: "inactive", pendingEXALT: 0 });

  const hours = (Date.now() - Number(m.startedAt)) / 3600000;
  res.json({
    status: "active",
    pendingEXALT: Number((hours * 1).toFixed(4)),
    totalClaimed: m.totalClaimed || 0
  });
});

app.post("/mining/claim", auth, (req, res) => {
  const db = readDb();
  const m = db.mining.find(x => x.userId === req.user.id);
  if (!m || m.status !== "active") return res.status(400).json({ error: "Mining is not active" });

  const hours = (Date.now() - Number(m.startedAt)) / 3600000;
  const reward = Number((hours * 1).toFixed(4));
  if (reward <= 0) return res.status(400).json({ error: "No reward yet" });

  const w = wallet(db, req.user.id);
  w.EXALT += reward;
  m.totalClaimed = Number(m.totalClaimed || 0) + reward;
  m.startedAt = Date.now();

  writeDb(db);
  res.json({ ok: true, claimedEXALT: reward, wallet: w });
});

app.get("/referral", auth, (req, res) => {
  const db = readDb();
  res.json({
    referralCode: req.user.referralCode,
    referrals: db.referrals.filter(r => r.referrerId === req.user.id)
  });
});

app.post("/order", auth, (req, res) => {
  const { side = "BUY", price = 0.001, amount = 0 } = req.body;
  const db = readDb();
  const w = wallet(db, req.user.id);
  const total = Number(price) * Number(amount);

  if (side === "BUY") {
    if (w.USDT < total) return res.status(400).json({ error: "Insufficient USDT" });
    w.USDT -= total;
    w.EXALT += Number(amount);
  } else {
    if (w.EXALT < Number(amount)) return res.status(400).json({ error: "Insufficient EXALT" });
    w.EXALT -= Number(amount);
    w.USDT += total;
  }

  const order = {
    id: nextId(db.orders),
    userId: req.user.id,
    market: "EXALTUSDT",
    side,
    price: Number(price),
    amount: Number(amount),
    total,
    status: "filled",
    createdAt: new Date().toISOString()
  };
  db.orders.push(order);
  writeDb(db);

  res.json({ ok: true, order, wallet: w });
});

app.get("/orders", auth, (req, res) => {
  const db = readDb();
  res.json({ orders: db.orders.filter(o => o.userId === req.user.id).reverse() });
});

app.listen(PORT, () => {
  console.log("Exalt Exchange Backend running on port " + PORT);
});

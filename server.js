require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 3008;
const MONGO_URI = process.env.MONGO_URI;

// Можно поменять, но лучше оставить стабильно
const DB_NAME = "shop";
const COLLECTION_NAME = "items";

let client;
let itemsCollection;

async function connectDB() {
  if (!MONGO_URI) {
    console.error("❌ MONGO_URI is not set. Add it to .env or hosting env vars.");
    process.exit(1);
  }

  client = new MongoClient(MONGO_URI);
  await client.connect();

  const db = client.db(DB_NAME);
  itemsCollection = db.collection(COLLECTION_NAME);

  console.log(`✅ MongoDB connected: db="${DB_NAME}", collection="${COLLECTION_NAME}"`);
}

// ===== Helpers =====
function isValidId(id) {
  return ObjectId.isValid(id);
}

function pickAllowedFields(body) {
  // базовая сущность item (можешь расширять)
  const out = {};
  if (body.name !== undefined) out.name = body.name;
  if (body.price !== undefined) out.price = body.price;
  if (body.category !== undefined) out.category = body.category;
  return out;
}

function validateItemForCreate(body) {
  const errors = [];

  if (!body || typeof body !== "object") errors.push("body must be a JSON object");

  const nameOk = body?.name && typeof body.name === "string" && body.name.trim();
  if (!nameOk) errors.push("name is required (non-empty string)");

  if (body?.price !== undefined) {
    const p = Number(body.price);
    if (Number.isNaN(p) || p < 0) errors.push("price must be a non-negative number");
  }

  if (body?.category !== undefined && typeof body.category !== "string") {
    errors.push("category must be a string");
  }

  return errors;
}

function normalizeItem(body, { requireAllFields }) {
  // Возвращаем { ok, value, error }
  const data = pickAllowedFields(body);

  if (requireAllFields) {
    // PUT: full update — требуем name (и можно требовать остальные если хочешь)
    if (data.name === undefined) {
      return { ok: false, error: "PUT requires full item: name is required" };
    }
  }

  const update = {};

  if (data.name !== undefined) {
    if (typeof data.name !== "string" || !data.name.trim()) {
      return { ok: false, error: "name must be a non-empty string" };
    }
    update.name = data.name.trim();
  }

  if (data.price !== undefined) {
    const p = Number(data.price);
    if (Number.isNaN(p) || p < 0) {
      return { ok: false, error: "price must be a non-negative number" };
    }
    update.price = p;
  }

  if (data.category !== undefined) {
    if (typeof data.category !== "string") {
      return { ok: false, error: "category must be a string" };
    }
    update.category = data.category.trim() || "general";
  }

  return { ok: true, value: update };
}

// ===== Basic endpoints =====
app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "API is running",
    task: "Practice Task 13",
    endpoints: {
      items: {
        list: "GET /api/items",
        getById: "GET /api/items/:id",
        create: "POST /api/items",
        put: "PUT /api/items/:id",
        patch: "PATCH /api/items/:id",
        remove: "DELETE /api/items/:id",
      },
      version: "GET /version",
    },
  });
});

app.get("/version", (req, res) => {
  res.json({
    version: "1.2",
    updatedAt: "2026-01-26",
  });
});

// ===== REST API: /api/items =====

// GET /api/items — retrieve all items
app.get("/api/items", async (req, res) => {
  try {
    // optional query examples:
    // /api/items?category=food&minPrice=10&sort=price
    const { category, minPrice, sort, limit = 50 } = req.query;

    const filter = {};
    if (category) filter.category = category;

    if (minPrice !== undefined) {
      const mp = Number(minPrice);
      if (Number.isNaN(mp)) {
        return res.status(400).json({ ok: false, error: "minPrice must be a number" });
      }
      filter.price = { $gte: mp };
    }

    let cursor = itemsCollection.find(filter);

    if (sort === "price") cursor = cursor.sort({ price: 1 });
    else cursor = cursor.sort({ createdAt: -1 });

    const lim = Math.min(Number(limit) || 50, 200);
    const items = await cursor.limit(lim).toArray();

    return res.status(200).json({ ok: true, count: items.length, items });
  } catch (err) {
    console.error("GET /api/items error:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// GET /api/items/:id — retrieve item by ID
app.get("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }

    const item = await itemsCollection.findOne({ _id: new ObjectId(id) });

    if (!item) {
      return res.status(404).json({ ok: false, error: "Item not found" });
    }

    return res.status(200).json({ ok: true, item });
  } catch (err) {
    console.error("GET /api/items/:id error:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// POST /api/items — create a new item
app.post("/api/items", async (req, res) => {
  try {
    const errors = validateItemForCreate(req.body);
    if (errors.length) {
      return res.status(400).json({ ok: false, error: errors.join("; ") });
    }

    const name = req.body.name.trim();
    const price = req.body.price !== undefined ? Number(req.body.price) : 0;
    const category =
      typeof req.body.category === "string" && req.body.category.trim()
        ? req.body.category.trim()
        : "general";

    const now = new Date();
    const doc = { name, price, category, createdAt: now, updatedAt: now };

    const result = await itemsCollection.insertOne(doc);
    const created = { ...doc, _id: result.insertedId };

    return res.status(201).json({ ok: true, item: created });
  } catch (err) {
    console.error("POST /api/items error:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// PUT /api/items/:id — full update
app.put("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }

    const normalized = normalizeItem(req.body, { requireAllFields: true });
    if (!normalized.ok) {
      return res.status(400).json({ ok: false, error: normalized.error });
    }

    // Для PUT обычно логика "полная замена". Здесь делаем "полный set":
    // если поле не пришло — ставим дефолт (кроме name который обязателен).
    const now = new Date();
    const fullDoc = {
      name: normalized.value.name, // обязателен
      price: normalized.value.price !== undefined ? normalized.value.price : 0,
      category: normalized.value.category !== undefined ? normalized.value.category : "general",
      updatedAt: now,
    };

    const result = await itemsCollection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: fullDoc },
      { returnDocument: "after" }
    );

    if (!result.value) {
      return res.status(404).json({ ok: false, error: "Item not found" });
    }

    return res.status(200).json({ ok: true, item: result.value });
  } catch (err) {
    console.error("PUT /api/items/:id error:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// PATCH /api/items/:id — partial update
app.patch("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }

    const normalized = normalizeItem(req.body, { requireAllFields: false });
    if (!normalized.ok) {
      return res.status(400).json({ ok: false, error: normalized.error });
    }

    const update = normalized.value;
    if (Object.keys(update).length === 0) {
      return res.status(400).json({ ok: false, error: "PATCH requires at least one field" });
    }

    update.updatedAt = new Date();

    const result = await itemsCollection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: "after" }
    );

    if (!result.value) {
      return res.status(404).json({ ok: false, error: "Item not found" });
    }

    return res.status(200).json({ ok: true, item: result.value });
  } catch (err) {
    console.error("PATCH /api/items/:id error:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// DELETE /api/items/:id — delete an item
app.delete("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }

    const result = await itemsCollection.findOneAndDelete({ _id: new ObjectId(id) });

    if (!result.value) {
      return res.status(404).json({ ok: false, error: "Item not found" });
    }

    // 204 No Content — без тела
    return res.status(204).send();
  } catch (err) {
    console.error("DELETE /api/items/:id error:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

// ===== 404 handler (JSON only, MUST BE LAST) =====
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

// ===== Start =====
connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 Server listening on port ${PORT}`);
      console.log(`Try: http://localhost:${PORT}/api/items`);
    });
  })
  .catch((err) => {
    console.error("❌ Failed to connect MongoDB:", err);
    process.exit(1);
  });

// ===== Graceful shutdown =====
process.on("SIGINT", async () => {
  try {
    if (client) await client.close();
    console.log("\n✅ MongoDB connection closed. Bye!");
    process.exit(0);
  } catch {
    process.exit(1);
  }
});

require("dotenv").config();

const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI;

let db;

function isValidObjectId(id) {
  return ObjectId.isValid(id) && String(new ObjectId(id)) === id;
}

function validateItemFull(body) {
  if (!body || typeof body !== "object") return "Body must be a JSON object";

  if (!body.name || typeof body.name !== "string" || !body.name.trim()) {
    return "Field 'name' is required and must be a non-empty string";
  }

  if (body.description !== undefined && typeof body.description !== "string") {
    return "Field 'description' must be a string";
  }
  if (body.quantity !== undefined && typeof body.quantity !== "number") {
    return "Field 'quantity' must be a number";
  }

  return null;
}

function validateItemPartial(body) {
  if (!body || typeof body !== "object") return "Body must be a JSON object";

  const allowed = ["name", "description", "quantity"];
  const keys = Object.keys(body);

  if (keys.length === 0) return "PATCH body cannot be empty";

  for (const k of keys) {
    if (!allowed.includes(k)) return `Unknown field '${k}'`;
  }

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return "Field 'name' must be a non-empty string";
    }
  }
  if (body.description !== undefined && typeof body.description !== "string") {
    return "Field 'description' must be a string";
  }
  if (body.quantity !== undefined && typeof body.quantity !== "number") {
    return "Field 'quantity' must be a number";
  }

  return null;
}

app.get("/", (req, res) => {
  res.status(200).json({ message: "API is working" });
});

app.get("/version", (req, res) => {
  res.status(200).json({
    version: "1.2",
    updatedAt: "2026-01-26"
  });
});

app.get("/api/items", async (req, res) => {
  try {
    const items = await db.collection("items").find().toArray();
    res.status(200).json(items);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.get("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const item = await db
      .collection("items")
      .findOne({ _id: new ObjectId(id) });

    if (!item) {
      return res.status(404).json({ error: "Not found" });
    }

    res.status(200).json(item);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/items", async (req, res) => {
  try {
    const validationError = validateItemFull(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const doc = {
      name: req.body.name.trim(),
      description: req.body.description ?? "",
      quantity: req.body.quantity ?? 0,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const result = await db.collection("items").insertOne(doc);
    const created = await db.collection("items").findOne({ _id: result.insertedId });

    res.status(201).json(created);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.put("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const validationError = validateItemFull(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const updateDoc = {
      name: req.body.name.trim(),
      description: req.body.description ?? "",
      quantity: req.body.quantity ?? 0,
      updatedAt: new Date()
    };

    const result = await db.collection("items").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateDoc }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    const updated = await db.collection("items").findOne({ _id: new ObjectId(id) });
    res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.patch("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const validationError = validateItemPartial(req.body);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }

    const patchDoc = { ...req.body, updatedAt: new Date() };
    if (patchDoc.name) patchDoc.name = patchDoc.name.trim();

    const result = await db.collection("items").updateOne(
      { _id: new ObjectId(id) },
      { $set: patchDoc }
    );

    if (result.matchedCount === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    const updated = await db.collection("items").findOne({ _id: new ObjectId(id) });
    res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.delete("/api/items/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!isValidObjectId(id)) {
      return res.status(400).json({ error: "Invalid ID" });
    }

    const result = await db.collection("items").deleteOne({
      _id: new ObjectId(id)
    });

    if (result.deletedCount === 0) {
      return res.status(404).json({ error: "Not found" });
    }

    res.status(204).send();
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error" });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

async function start() {
  try {
    if (!MONGO_URI) {
      console.error("MONGO_URI is missing in environment variables");
      process.exit(1);
    }

    const client = new MongoClient(MONGO_URI);
    await client.connect();
    db = client.db();

    console.log("MongoDB connected");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error("Startup error:", err);
    process.exit(1);
  }
}

start();

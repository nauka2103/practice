const { ObjectId } = require("mongodb");
const { getDB } = require("../db");

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

async function getAllItems(req, res) {
  try {
    const db = getDB();
    const items = await db.collection("items").find().toArray();
    return res.status(200).json(items);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function getItemById(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid ID" });

    const db = getDB();
    const item = await db.collection("items").findOne({ _id: new ObjectId(id) });

    if (!item) return res.status(404).json({ error: "Not found" });
    return res.status(200).json(item);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function createItem(req, res) {
  try {
    const validationError = validateItemFull(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const db = getDB();
    const doc = {
      name: req.body.name.trim(),
      description: req.body.description ?? "",
      quantity: req.body.quantity ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await db.collection("items").insertOne(doc);
    const created = await db.collection("items").findOne({ _id: result.insertedId });

    return res.status(201).json(created);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function putItem(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid ID" });

    const validationError = validateItemFull(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const db = getDB();
    const replacement = {
      name: req.body.name.trim(),
      description: req.body.description ?? "",
      quantity: req.body.quantity ?? 0,
      updatedAt: new Date(),
    };

    const result = await db.collection("items").updateOne(
      { _id: new ObjectId(id) },
      { $set: replacement }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: "Not found" });

    const updated = await db.collection("items").findOne({ _id: new ObjectId(id) });
    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function patchItem(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid ID" });

    const validationError = validateItemPartial(req.body);
    if (validationError) return res.status(400).json({ error: validationError });

    const db = getDB();
    const patchDoc = { ...req.body, updatedAt: new Date() };
    if (patchDoc.name) patchDoc.name = patchDoc.name.trim();

    const result = await db.collection("items").updateOne(
      { _id: new ObjectId(id) },
      { $set: patchDoc }
    );

    if (result.matchedCount === 0) return res.status(404).json({ error: "Not found" });

    const updated = await db.collection("items").findOne({ _id: new ObjectId(id) });
    return res.status(200).json(updated);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

async function deleteItem(req, res) {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) return res.status(400).json({ error: "Invalid ID" });

    const db = getDB();
    const result = await db.collection("items").deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0) return res.status(404).json({ error: "Not found" });

    return res.status(204).send();
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Server error" });
  }
}

module.exports = {
  getAllItems,
  getItemById,
  createItem,
  putItem,
  patchItem,
  deleteItem,
};

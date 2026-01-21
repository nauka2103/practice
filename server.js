require("dotenv").config();

const express = require("express");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3008;
const MONGO_URI = process.env.MONGO_URI;

const DB_NAME = "shop";
const COLLECTION_NAME = "products";

let client;
let productsCollection;

async function connectDB() {
  if (!MONGO_URI) {
    console.error("MONGO_URI is not set. Add it to .env (local) or hosting env vars (production).");
    process.exit(1);
  }

  client = new MongoClient(MONGO_URI);
  await client.connect();

  const db = client.db(DB_NAME);
  productsCollection = db.collection(COLLECTION_NAME);

  console.log(`MongoDB connected: db="${DB_NAME}", collection="${COLLECTION_NAME}"`);
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "API is running",
    endpoints: {
      list: "GET /api/products",
      getById: "GET /api/products/:id",
      create: "POST /api/products",
      update: "PUT /api/products/:id",
      remove: "DELETE /api/products/:id",
    },
    queryExamples: [
      "/api/products?category=Electronics",
      "/api/products?minPrice=50&sort=price",
      "/api/products?fields=name,price",
    ],
  });
});

app.get("/api/products", async (req, res) => {
  try {
    const filter = {};

    if (req.query.category) {
      filter.category = req.query.category;
    }

    if (req.query.minPrice !== undefined) {
      const minPrice = Number(req.query.minPrice);
      if (Number.isNaN(minPrice)) {
        return res.status(400).json({ ok: false, error: "minPrice must be a number" });
      }
      filter.price = { $gte: minPrice };
    }

    let sortOption;
    if (req.query.sort === "price") {
      sortOption = { price: 1 };
    }

    let projection;
    if (req.query.fields) {
      projection = {};
      const fields = req.query.fields
        .split(",")
        .map((f) => f.trim())
        .filter(Boolean);

      for (const f of fields) {
        projection[f] = 1;
      }

      if (!projection._id) projection._id = 0;
    }

    let cursor = productsCollection.find(filter);
    if (sortOption) cursor = cursor.sort(sortOption);
    if (projection) cursor = cursor.project(projection);

    const products = await cursor.toArray();
    return res.json({ ok: true, count: products.length, products });
  } catch (err) {
    console.error("Error in GET /api/products:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

app.get("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }

    const product = await productsCollection.findOne({ _id: new ObjectId(id) });

    if (!product) {
      return res.status(404).json({ ok: false, error: "Product not found" });
    }

    return res.json({ ok: true, product });
  } catch (err) {
    console.error("Error in GET /api/products/:id:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

app.post("/api/products", async (req, res) => {
  try {
    const { name, price, category } = req.body;

    if (!name || typeof name !== "string" || !name.trim()) {
      return res.status(400).json({ ok: false, error: "name is required" });
    }

    const p = price !== undefined ? Number(price) : 0;
    if (Number.isNaN(p) || p < 0) {
      return res.status(400).json({ ok: false, error: "price must be a non-negative number" });
    }

    const doc = {
      name: name.trim(),
      price: p,
      category: typeof category === "string" && category.trim() ? category.trim() : "general",
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await productsCollection.insertOne(doc);
    const created = { ...doc, _id: result.insertedId };

    return res.status(201).json({ ok: true, product: created });
  } catch (err) {
    console.error("Error in POST /api/products:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

app.put("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }

    const update = {};
    const { name, price, category } = req.body;

    if (name !== undefined) {
      if (typeof name !== "string" || !name.trim()) {
        return res.status(400).json({ ok: false, error: "name must be a non-empty string" });
      }
      update.name = name.trim();
    }

    if (price !== undefined) {
      const p = Number(price);
      if (Number.isNaN(p) || p < 0) {
        return res.status(400).json({ ok: false, error: "price must be a non-negative number" });
      }
      update.price = p;
    }

    if (category !== undefined) {
      if (typeof category !== "string") {
        return res.status(400).json({ ok: false, error: "category must be a string" });
      }
      update.category = category.trim() || "general";
    }

    update.updatedAt = new Date();

    const result = await productsCollection.findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: "after" }
    );

    if (!result.value) {
      return res.status(404).json({ ok: false, error: "Product not found" });
    }

    return res.json({ ok: true, product: result.value });
  } catch (err) {
    console.error("Error in PUT /api/products/:id:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

app.delete("/api/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ ok: false, error: "Invalid id" });
    }

    const result = await productsCollection.findOneAndDelete({ _id: new ObjectId(id) });

    if (!result.value) {
      return res.status(404).json({ ok: false, error: "Product not found" });
    }

    return res.json({ ok: true, message: "Product deleted", product: result.value });
  } catch (err) {
    console.error("Error in DELETE /api/products/:id:", err);
    return res.status(500).json({ ok: false, error: "Internal server error" });
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Route not found" });
});

connectDB()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Server started on http://localhost:${PORT}`);
      console.log(`Try: http://localhost:${PORT}/api/products`);
    });
  })
  .catch((err) => {
    console.error("Failed to connect MongoDB:", err);
    process.exit(1);
  });

process.on("SIGINT", async () => {
  try {
    if (client) await client.close();
    console.log("\n MongoDB connection closed. Bye!");
    process.exit(0);
  } catch (e) {
    process.exit(1);
  }
});

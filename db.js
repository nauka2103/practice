const { MongoClient } = require("mongodb");

let db;

async function connectDB(uri) {
  const client = new MongoClient(uri);
  await client.connect();
  db = client.db(); 
  console.log("MongoDB connected");
  return db;
}

function getDB() {
  if (!db) throw new Error("DB not connected yet");
  return db;
}

module.exports = { connectDB, getDB };

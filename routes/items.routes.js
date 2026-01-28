const express = require("express");
const {
  getAllItems,
  getItemById,
  createItem,
  putItem,
  patchItem,
  deleteItem,
} = require("../controllers/items.controller");

const router = express.Router();

router.get("/", getAllItems);
router.get("/:id", getItemById);
router.post("/", createItem);
router.put("/:id", putItem);
router.patch("/:id", patchItem);
router.delete("/:id", deleteItem);

module.exports = router;

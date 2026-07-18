const express = require("express");
const router = express.Router();
const fileController = require("../controllers/fileController");

router.get("/:id", fileController.streamFile);

module.exports = router;

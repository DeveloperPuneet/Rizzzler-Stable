const express = require("express");
const router = express.Router();
const fileController = require("../controllers/fileController");
const asyncHandler = require("../middlewares/asyncHandler");

router.get("/:id", asyncHandler(fileController.streamFile));

module.exports = router;

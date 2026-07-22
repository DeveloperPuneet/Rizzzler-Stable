const mongoose = require("mongoose");
const storageRouter = require("../config/storageRouter");

// Streams a file straight out of MongoDB GridFS. No file ever lives on
// local disk. The storage router transparently resolves which cluster
// the file actually lives on via the FileLocation routing table — this
// controller doesn't need to know or care how many clusters exist.
exports.streamFile = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).end();
    const fileId = new mongoose.Types.ObjectId(id);

    const result = await storageRouter.openDownloadStream(fileId);
    if (!result) return res.status(404).end();

    const { file, stream } = result;
    res.set("Content-Type", file.contentType || "application/octet-stream");
    res.set("Cache-Control", "public, max-age=31536000, immutable");

    stream.pipe(res);
    stream.on("error", (err) => {
      console.error("File stream error:", err);
      if (!res.headersSent) res.status(500).end();
    });
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
};

const mongoose = require("mongoose");

// Streams a file straight out of MongoDB GridFS. No file ever lives on disk.
exports.streamFile = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).end();

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "uploads",
    });

    const _id = new mongoose.Types.ObjectId(id);
    const files = await bucket.find({ _id }).toArray();
    if (!files.length) return res.status(404).end();

    const file = files[0];
    res.set("Content-Type", file.contentType || "application/octet-stream");
    res.set("Cache-Control", "public, max-age=31536000, immutable");

    bucket.openDownloadStream(_id).pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).end();
  }
};

const express = require("express");
const router = express.Router();
const registry = require("../shared/registry");

// GET /api/registry
// Exposes the same themes/effects registry the server renders EJS views
// from, so any client-side JS (or a future SPA) can build UI from the
// exact same single source of truth instead of hardcoding a second copy.
router.get("/registry", (req, res) => {
  res.json({
    themes: registry.themes.map((t) => ({
      key: t.key,
      label: t.label,
      desc: t.desc,
      accent: t.accent,
    })),
    avatarEffects: registry.avatarEffects,
    titleEffects: registry.titleEffects,
    showcaseEffects: registry.showcaseEffects,
  });
});

module.exports = router;

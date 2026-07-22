// Backward-compatible re-export. Avatar/title/showcase effects now live in
// shared/registry.js (the single source of truth used by both frontend
// rendering and backend validation). Keep this file so any existing
// `require("../config/visuals")` call sites keep working without modification.
const registry = require("../shared/registry");
module.exports = {
  avatarEffects: registry.avatarEffects,
  titleEffects: registry.titleEffects,
  showcaseEffects: registry.showcaseEffects,
};

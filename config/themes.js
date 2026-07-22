// Backward-compatible re-export. Themes now live in shared/registry.js
// (the single source of truth used by both frontend rendering and backend
// validation). Keep this file so any existing `require("../config/themes")`
// call sites keep working without modification.
module.exports = require("../shared/registry").themes;

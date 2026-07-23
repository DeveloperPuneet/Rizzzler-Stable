/**
 * middlewares/asyncHandler.js
 * =====================================================================
 * Wraps an Express route handler so that any error it throws or rejects
 * with is forwarded to next(err) automatically.
 *
 * Express 4 does NOT catch rejected promises from async handlers on its
 * own. Without this, an async controller that throws (a DB hiccup, a
 * validation error, an unreachable storage cluster, etc.) becomes an
 * unhandled promise rejection: Express never sends a response, and the
 * request just hangs forever with the browser spinning and no error
 * shown. Several controllers in this app were affected by exactly this
 * (see: avatar upload hang, and the same gap in admin/auth/showcase
 * routes) — wrapping every route with this closes the gap everywhere at
 * once instead of relying on each controller remembering its own
 * try/catch.
 *
 * Usage: router.get("/path", asyncHandler(controller.someHandler));
 * Safe to wrap sync handlers too — they just pass straight through.
 * =====================================================================
 */
module.exports = function asyncHandler(fn) {
  return function (req, res, next) {
    try {
      Promise.resolve(fn(req, res, next)).catch(next);
    } catch (err) {
      next(err);
    }
  };
};

/**
 * Wraps async controllers so we never repeat try/catch.
 * Any thrown/rejected error is forwarded to the central error middleware.
 */
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

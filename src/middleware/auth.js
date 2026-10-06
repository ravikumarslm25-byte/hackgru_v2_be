import { asyncHandler } from '../utils/asyncHandler.js';
import { ApiError } from '../utils/ApiError.js';
import { verifyToken } from '../utils/token.js';
import { User } from '../models/User.js';
import { ALL_PERMISSIONS } from '../config/permissions.js';

/** Require a valid JWT; attaches req.user (+ effective permissions). */
export const protect = asyncHandler(async (req, _res, next) => {
  let token;
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) token = header.split(' ')[1];
  if (!token) throw ApiError.unauthorized('No token provided');

  const decoded = verifyToken(token);
  const user = await User.findById(decoded.id).populate('staffRole', 'name key permissions');
  if (!user) throw ApiError.unauthorized('User no longer exists');
  req.user = user;
  // Effective permissions: admin holds all; staff gets their role's set.
  req.user._perms = user.role === 'admin' ? ALL_PERMISSIONS : (user.staffRole?.permissions || []);
  next();
});

/** Restrict a route to specific roles. Usage: authorize('admin') */
export const authorize = (...roles) => (req, _res, next) => {
  if (!roles.includes(req.user.role)) {
    throw ApiError.forbidden('You do not have permission for this action');
  }
  next();
};

/** Require one of the given permission keys (admin always passes). */
export const requirePermission = (...keys) => (req, _res, next) => {
  if (req.user.role === 'admin') return next();
  const have = req.user._perms || [];
  if (keys.some((k) => have.includes(k))) return next();
  throw ApiError.forbidden('You do not have permission for this action');
};

/** Attaches req.user if a valid token is present, but never blocks the request. */
export const optionalAuth = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const decoded = verifyToken(header.split(' ')[1]);
      req.user = await User.findById(decoded.id);
    } catch { /* ignore — treat as anonymous */ }
  }
  next();
});

'use strict';

const { ApiError } = require('../utils/ApiError');
const { verifyAccessToken } = require('../utils/jwt');
const { prisma } = require('../config/database');

const createAuthenticate = database => async (req, _res, next) => {
  const header = req.get('authorization');
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return next(new ApiError(401, 'AUTH_REQUIRED', 'Authentication required.'));
  let payload;
  try {
    payload = verifyAccessToken(token);
    if (payload.type !== 'access' || !payload.userId || !payload.role || !Number.isInteger(payload.tokenVersion)) {
      throw new Error('Invalid access-token claims.');
    }
  } catch (error) {
    if (error?.name === 'TokenExpiredError') {
      return next(new ApiError(401, 'TOKEN_EXPIRED', 'Access token has expired.'));
    }
    return next(new ApiError(401, 'INVALID_TOKEN', 'Access token is invalid or expired.'));
  }
  const user = await database.user.findUnique({
    where: { id: BigInt(payload.userId) },
    select: { id: true, role: true, status: true, tokenVersion: true },
  });
  if (!user) return next(new ApiError(401, 'INVALID_TOKEN', 'Access token user no longer exists.'));
  if (user.status !== 'ACTIVE') return next(new ApiError(403, 'ACCOUNT_INACTIVE', 'Account is inactive.'));
  if (user.tokenVersion !== payload.tokenVersion) {
    return next(new ApiError(401, 'INVALID_TOKEN', 'Access token has been revoked.'));
  }
  req.auth = { userId: String(user.id), role: user.role };
  return next();
};

const authenticate = createAuthenticate(prisma);

module.exports = { authenticate, createAuthenticate };

'use strict';

const { Prisma } = require('@prisma/client');
const { env } = require('../config/env');
const { ApiError } = require('../utils/ApiError');

const errorHandler = (error, _req, res, _next) => {
  let apiError = error;
  if (error?.type === 'entity.too.large') {
    apiError = new ApiError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large.');
  } else if (error instanceof SyntaxError && error?.type === 'entity.parse.failed') {
    apiError = new ApiError(400, 'INVALID_JSON', 'Request body contains invalid JSON.');
  } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
    apiError = new ApiError(409, 'DATABASE_CONFLICT', 'The requested operation conflicts with existing data.');
  } else if (!(error instanceof ApiError)) {
    apiError = new ApiError(500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
  }
  if (env.NODE_ENV !== 'test') console.error(error);
  return res.status(apiError.statusCode).json({
    success: false,
    error: { code: apiError.code, message: apiError.message,
      ...(apiError.details ? { details: apiError.details } : {}) },
  });
};

module.exports = { errorHandler };

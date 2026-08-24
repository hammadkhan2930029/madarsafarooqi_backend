'use strict';

const { ApiError } = require('../utils/ApiError');

const notFound = (req, _res, next) =>
  next(new ApiError(404, 'NOT_FOUND', `Route ${req.method} ${req.originalUrl} was not found.`));

module.exports = { notFound };

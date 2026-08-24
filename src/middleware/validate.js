'use strict';

const { ApiError } = require('../utils/ApiError');

const validate = schema => (req, _res, next) => {
  const result = schema.safeParse({ body: req.body, params: req.params, query: req.query });
  if (!result.success) {
    return next(new ApiError(422, 'VALIDATION_ERROR', 'Request validation failed.',
      result.error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message }))));
  }
  req.validated = result.data;
  return next();
};

module.exports = { validate };

'use strict';

const { ApiError } = require('../utils/ApiError');

const authorize = (...roles) => (req, _res, next) => {
  if (!req.auth || !roles.includes(req.auth.role)) {
    return next(new ApiError(403, 'FORBIDDEN', 'You are not authorized to perform this action.'));
  }
  return next();
};

module.exports = { authorize };

'use strict';

const sendSuccess = (res, { statusCode = 200, message, data, meta }) => res.status(statusCode).json({
  success: true,
  message,
  ...(data !== undefined ? { data } : {}),
  ...(meta !== undefined ? { meta } : {}),
});

module.exports = { sendSuccess };

'use strict';
const express = require('express');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const { salaryService } = require('./salaries.service');
const { listSchema } = require('./salaries.validation');

const createMySalaryRouter = (service = salaryService, auth = authenticate) => {
  const router = express.Router();
  router.use(auth, authorize('TEACHER'));
  router.get('/', validate(listSchema), asyncHandler(async (req, res) => { const result = await service.mine(req.auth.userId, req.validated.query); return sendSuccess(res, { message: 'My salaries loaded.', data: result.items, meta: result.pagination }); }));
  return router;
};
module.exports = { createMySalaryRouter };

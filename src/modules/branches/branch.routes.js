'use strict';

const express = require('express');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/asyncHandler');
const { branchService } = require('./branch.service');
const { createBranchController } = require('./branch.controller');
const rules = require('./branch.validation');

const createBranchRouter = (service = branchService, authMiddleware = authenticate) => {
  const router = express.Router();
  const controller = createBranchController(service);
  router.use(authMiddleware);
  router.get('/', authorize('SUPER_ADMIN', 'TEACHER'), validate(rules.listBranchesSchema), asyncHandler(controller.list));
  router.post('/', authorize('SUPER_ADMIN'), validate(rules.createBranchSchema), asyncHandler(controller.create));
  router.get('/:id', authorize('SUPER_ADMIN', 'TEACHER'), validate(rules.getBranchSchema), asyncHandler(controller.get));
  router.patch('/:id', authorize('SUPER_ADMIN'), validate(rules.updateBranchSchema), asyncHandler(controller.update));
  router.patch('/:id/status', authorize('SUPER_ADMIN'), validate(rules.updateBranchStatusSchema), asyncHandler(controller.updateStatus));
  return router;
};

module.exports = { createBranchRouter };

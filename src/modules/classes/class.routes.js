'use strict';

const express = require('express');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/asyncHandler');
const { classService } = require('./class.service');
const { createClassController } = require('./class.controller');
const rules = require('./class.validation');

const createClassRouter = (service = classService, authMiddleware = authenticate) => {
  const router = express.Router();
  const controller = createClassController(service);
  router.use(authMiddleware);
  router.get('/', authorize('SUPER_ADMIN', 'TEACHER'), validate(rules.listClassesSchema), asyncHandler(controller.list));
  router.post('/', authorize('SUPER_ADMIN'), validate(rules.createClassSchema), asyncHandler(controller.create));
  router.get('/:id', authorize('SUPER_ADMIN', 'TEACHER'), validate(rules.getClassSchema), asyncHandler(controller.get));
  router.patch('/:id', authorize('SUPER_ADMIN'), validate(rules.updateClassSchema), asyncHandler(controller.update));
  router.patch('/:id/status', authorize('SUPER_ADMIN'), validate(rules.updateClassStatusSchema), asyncHandler(controller.updateStatus));
  return router;
};
module.exports = { createClassRouter };

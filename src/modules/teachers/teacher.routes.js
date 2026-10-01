'use strict';

const express = require('express');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const { passwordRateLimit } = require('../../middleware/rateLimit');
const { asyncHandler } = require('../../utils/asyncHandler');
const { teacherService } = require('./teacher.service');
const { createTeacherController } = require('./teacher.controller');
const rules = require('./teacher.validation');

const createTeacherRouter = (service = teacherService, authMiddleware = authenticate) => {
  const router = express.Router(); const controller = createTeacherController(service);
  router.use(authMiddleware, authorize('SUPER_ADMIN'));
  router.get('/', validate(rules.listTeachersSchema), asyncHandler(controller.list));
  router.post('/', validate(rules.createTeacherSchema), asyncHandler(controller.create));
  router.post('/:id/profile-image', validate(rules.uploadProfileImageSchema), asyncHandler(controller.uploadProfileImage));
  router.patch('/:teacherId/reset-password', passwordRateLimit, validate(rules.resetTeacherPasswordSchema), asyncHandler(controller.resetPassword));
  router.get('/:id', validate(rules.getTeacherSchema), asyncHandler(controller.get));
  router.patch('/:id', validate(rules.updateTeacherSchema), asyncHandler(controller.update));
  router.patch('/:id/status', validate(rules.updateTeacherStatusSchema), asyncHandler(controller.updateStatus));
  return router;
};
module.exports = { createTeacherRouter };

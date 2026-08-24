'use strict';

const express = require('express');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/asyncHandler');
const { studentService } = require('./student.service');
const { createStudentController } = require('./student.controller');
const rules = require('./student.validation');

const createStudentRouter = (service = studentService, authMiddleware = authenticate) => {
  const router = express.Router(); const controller = createStudentController(service);
  router.use(authMiddleware);
  router.get('/me', authorize('TEACHER'), validate(rules.myStudentsSchema), asyncHandler(controller.mine));
  router.use(authorize('SUPER_ADMIN'));
  router.get('/', validate(rules.listStudentsSchema), asyncHandler(controller.list));
  router.post('/', validate(rules.createStudentSchema), asyncHandler(controller.create));
  router.get('/:id', validate(rules.getStudentSchema), asyncHandler(controller.get));
  router.patch('/:id', validate(rules.updateStudentSchema), asyncHandler(controller.update));
  router.patch('/:id/status', validate(rules.updateStudentStatusSchema), asyncHandler(controller.updateStatus));
  router.delete('/:id', validate(rules.deleteStudentSchema), asyncHandler(controller.remove));
  return router;
};
module.exports = { createStudentRouter };

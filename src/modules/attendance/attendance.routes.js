'use strict';

const express = require('express');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { validate } = require('../../middleware/validate');
const { asyncHandler } = require('../../utils/asyncHandler');
const { attendanceService } = require('./attendance.service');
const { createAttendanceController } = require('./attendance.controller');
const rules = require('./attendance.validation');

const createAttendanceRouter = (service = attendanceService, authMiddleware = authenticate) => {
  const router = express.Router(); const controller = createAttendanceController(service);
  router.use(authMiddleware, authorize('TEACHER'));
  router.get('/check-in-availability', validate(rules.todaySchema), asyncHandler(controller.availability));
  router.post('/check-in', validate(rules.actionSchema), asyncHandler(controller.checkIn));
  router.post('/check-out', validate(rules.actionSchema), asyncHandler(controller.checkOut));
  router.get('/today', validate(rules.todaySchema), asyncHandler(controller.today));
  router.get('/me', validate(rules.myAttendanceSchema), asyncHandler(controller.mine));
  return router;
};
const createAdminAttendanceRouter = (service = attendanceService, authMiddleware = authenticate) => {
  const router = express.Router(); const controller = createAttendanceController(service);
  router.use(authMiddleware, authorize('SUPER_ADMIN'));
  router.get('/', validate(rules.adminAttendanceSchema), asyncHandler(controller.admin));
  router.patch('/:attendanceId', validate(rules.correctAttendanceSchema), asyncHandler(controller.correct));
  return router;
};
module.exports = { createAdminAttendanceRouter, createAttendanceRouter };

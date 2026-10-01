'use strict';

const express = require('express');
const { authenticate } = require('../../middleware/authenticate');
const { authorize } = require('../../middleware/authorize');
const { asyncHandler } = require('../../utils/asyncHandler');
const { sendSuccess } = require('../../utils/response');
const { adminNotificationService } = require('./adminNotifications.service');

const createAdminNotificationRouter = (service = adminNotificationService, auth = authenticate) => {
  const router = express.Router();
  router.use(auth, authorize('SUPER_ADMIN'));
  router.get('/', asyncHandler(async (req, res) => sendSuccess(res, { message: 'Notifications loaded.', data: await service.list(req.auth.userId) })));
  return router;
};

module.exports = { createAdminNotificationRouter };

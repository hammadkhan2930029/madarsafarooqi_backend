'use strict';

const express = require('express');

const { authenticate } = require('../../middleware/authenticate');
const { validate } = require('../../middleware/validate');
const { loginRateLimit, passwordRateLimit, refreshRateLimit } = require('../../middleware/rateLimit');
const { asyncHandler } = require('../../utils/asyncHandler');
const { authService } = require('./auth.service');
const { createAuthController } = require('./auth.controller');
const { acceptIjaraTermsSchema, changePasswordSchema, loginSchema, refreshSchema } = require('./auth.validation');
const { onboardingService } = require('./onboarding.service');
const { createOnboardingController } = require('./onboarding.controller');
const onboardingRules = require('./onboarding.validation');

const createAuthRouter = (service = authService, authMiddleware = authenticate) => {
  const router = express.Router();
  const controller = createAuthController(service);
  const onboarding = createOnboardingController(onboardingService);
  router.post('/login', loginRateLimit, validate(loginSchema), asyncHandler(controller.login));
  router.post('/refresh', refreshRateLimit, validate(refreshSchema), asyncHandler(controller.refresh));
  router.post('/logout', validate(refreshSchema), asyncHandler(controller.logout));
  router.get('/me', authMiddleware, asyncHandler(controller.me));
  router.get('/onboarding', authMiddleware, validate(onboardingRules.statusSchema), asyncHandler(onboarding.status));
  router.post('/onboarding/profile-image', authMiddleware, validate(onboardingRules.uploadSchema), asyncHandler(onboarding.upload));
  router.post('/onboarding/complete', authMiddleware, validate(onboardingRules.completeSchema), asyncHandler(onboarding.complete));
  router.patch('/accept-ijara-terms', authMiddleware, validate(acceptIjaraTermsSchema), asyncHandler(controller.acceptIjaraTerms));
  router.patch('/change-password', passwordRateLimit, authMiddleware, validate(changePasswordSchema), asyncHandler(controller.changePassword));
  return router;
};

module.exports = { createAuthRouter };

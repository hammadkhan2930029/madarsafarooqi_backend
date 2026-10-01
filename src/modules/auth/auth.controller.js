'use strict';

const { sendSuccess } = require('../../utils/response');

const createAuthController = service => ({
  login: async (req, res) => sendSuccess(res, {
    message: 'Login successful.', data: await service.login(req.validated.body),
  }),
  refresh: async (req, res) => sendSuccess(res, {
    message: 'Tokens refreshed.', data: await service.refresh(req.validated.body.refreshToken),
  }),
  logout: async (req, res) => {
    await service.logout(req.validated.body.refreshToken);
    return sendSuccess(res, { message: 'Logout successful.' });
  },
  me: async (req, res) => sendSuccess(res, {
    message: 'Profile loaded.', data: await service.me(req.auth.userId),
  }),
  acceptIjaraTerms: async (req, res) => sendSuccess(res, { message: 'Ijara terms accepted.', data: await service.acceptIjaraTerms(req.auth.userId, req.validated.body.version) }),
  changePassword: async (req, res) => {
    await service.changePassword(req.auth.userId, req.validated.body);
    return sendSuccess(res, { message: 'Password changed. Please log in again.' });
  },
});

module.exports = { createAuthController };

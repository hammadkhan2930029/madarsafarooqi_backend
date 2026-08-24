'use strict';

const { sendSuccess } = require('../../utils/response');
const requestMetadata = req => {
  const requestId = String(req.get('x-request-id') || '').slice(0, 100);
  return {
    ip: String(req.ip || '').slice(0, 100),
    userAgent: String(req.get('user-agent') || '').slice(0, 500),
    method: req.method,
    path: req.originalUrl.split('?')[0].slice(0, 500),
    ...(requestId ? { requestId } : {}),
  };
};
const createTeacherController = service => ({
  list: async (req, res) => { const result = await service.list(req.validated.query); return sendSuccess(res, { message: 'Teachers loaded.', data: result.items, meta: result.pagination }); },
  create: async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Teacher created.', data: await service.create(req.validated.body, req.auth) }),
  get: async (req, res) => sendSuccess(res, { message: 'Teacher loaded.', data: await service.get(req.validated.params.id) }),
  update: async (req, res) => sendSuccess(res, { message: 'Teacher updated.', data: await service.update(req.validated.params.id, req.validated.body, req.auth) }),
  updateStatus: async (req, res) => sendSuccess(res, { message: 'Teacher status updated.', data: await service.updateStatus(req.validated.params.id, req.validated.body.status) }),
  resetPassword: async (req, res) => {
    await service.resetPassword(req.validated.params.teacherId, req.validated.body, req.auth, requestMetadata(req));
    return sendSuccess(res, { message: 'Teacher password reset successfully.' });
  },
});
module.exports = { createTeacherController, requestMetadata };

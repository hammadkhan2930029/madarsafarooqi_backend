'use strict';

const { sendSuccess } = require('../../utils/response');
const createStudentController = service => ({
  mine: async (req, res) => { const result = await service.mine(req.auth.userId, req.validated.query); return sendSuccess(res, { message: 'Assigned students loaded.', data: result.items, meta: result.pagination }); },
  list: async (req, res) => { const result = await service.list(req.validated.query); return sendSuccess(res, { message: 'Students loaded.', data: result.items, meta: result.pagination }); },
  create: async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Student created.', data: await service.create(req.validated.body, req.auth) }),
  get: async (req, res) => sendSuccess(res, { message: 'Student loaded.', data: await service.get(req.validated.params.id) }),
  update: async (req, res) => sendSuccess(res, { message: 'Student updated.', data: await service.update(req.validated.params.id, req.validated.body) }),
  updateStatus: async (req, res) => sendSuccess(res, { message: 'Student status updated.', data: await service.updateStatus(req.validated.params.id, req.validated.body.status) }),
  remove: async (req, res) => sendSuccess(res, { message: 'Student deactivated.', data: await service.remove(req.validated.params.id) }),
});
module.exports = { createStudentController };

'use strict';
const { sendSuccess } = require('../../utils/response');
const createHolidayController = service => ({
  list: async (req, res) => { const result = await service.list(req.validated.query); return sendSuccess(res, { message: 'Holidays loaded.', data: result.items, meta: result.pagination }); },
  create: async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Holiday created.', data: await service.create(req.validated.body, req.auth) }),
  get: async (req, res) => sendSuccess(res, { message: 'Holiday loaded.', data: await service.get(req.validated.params.id) }),
  update: async (req, res) => sendSuccess(res, { message: 'Holiday updated.', data: await service.update(req.validated.params.id, req.validated.body) }),
  updateStatus: async (req, res) => sendSuccess(res, { message: 'Holiday status updated.', data: await service.updateStatus(req.validated.params.id, req.validated.body.status) }),
  remove: async (req, res) => sendSuccess(res, { message: 'Holiday deactivated.', data: await service.updateStatus(req.validated.params.id, 'INACTIVE') }),
});
module.exports = { createHolidayController };

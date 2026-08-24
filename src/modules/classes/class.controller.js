'use strict';

const { sendSuccess } = require('../../utils/response');

const createClassController = service => ({
  list: async (req, res) => {
    const result = await service.list(req.validated.query, req.auth);
    return sendSuccess(res, { message: 'Classes loaded.', data: result.items, meta: result.pagination });
  },
  create: async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Class created.', data: await service.create(req.validated.body, req.auth) }),
  get: async (req, res) => sendSuccess(res, { message: 'Class loaded.', data: await service.get(req.validated.params.id, req.auth) }),
  update: async (req, res) => sendSuccess(res, { message: 'Class updated.', data: await service.update(req.validated.params.id, req.validated.body, req.auth) }),
  updateStatus: async (req, res) => sendSuccess(res, { message: 'Class status updated.', data: await service.updateStatus(req.validated.params.id, req.validated.body.status, req.auth) }),
});
module.exports = { createClassController };

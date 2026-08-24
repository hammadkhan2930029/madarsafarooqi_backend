'use strict';

const { sendSuccess } = require('../../utils/response');
const requestMetadata = req => ({
  ip: String(req.ip || '').slice(0, 100), userAgent: String(req.get('user-agent') || '').slice(0, 500),
  method: req.method, path: req.originalUrl.split('?')[0].slice(0, 500),
});
const createAttendanceController = service => ({
  availability: async (req, res) => sendSuccess(res, { message: 'Check-in availability loaded.', data: await service.availability(req.auth.userId) }),
  checkIn: async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Checked in successfully.', data: await service.checkIn(req.auth.userId) }),
  checkOut: async (req, res) => sendSuccess(res, { message: 'Checked out successfully.', data: await service.checkOut(req.auth.userId) }),
  today: async (req, res) => sendSuccess(res, { message: 'Today attendance loaded.', data: await service.today(req.auth.userId) }),
  mine: async (req, res) => { const result = await service.mine(req.auth.userId, req.validated.query); return sendSuccess(res, { message: 'Attendance loaded.', data: result.items, meta: result.pagination }); },
  admin: async (req, res) => { const result = await service.admin(req.validated.query); return sendSuccess(res, { message: 'Attendance loaded.', data: result.items, meta: result.pagination }); },
  correct: async (req, res) => sendSuccess(res, { message: 'Attendance corrected successfully.', data: await service.correct(req.validated.params.attendanceId, req.validated.body, req.auth, requestMetadata(req)) }),
});
module.exports = { createAttendanceController, requestMetadata };

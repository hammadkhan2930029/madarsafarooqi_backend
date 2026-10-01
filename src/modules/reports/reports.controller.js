'use strict';

const { sendSuccess } = require('../../utils/response');
const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;

const csv = (items, language) => {
  const urdu = language === 'ur';
  const headings = urdu
    ? ['\u0639\u0645\u0644\u06d2 \u06a9\u0627 \u0646\u0627\u0645', '\u0628\u0631\u0627\u0646\u0686', '\u062c\u0645\u0627\u0639\u062a', '\u0642\u0633\u0645', '\u0631\u067e\u0648\u0631\u0679 \u06a9\u06cc \u062a\u0627\u0631\u06cc\u062e', '\u0645\u062f\u062a \u0634\u0631\u0648\u0639', '\u0645\u062f\u062a \u062e\u062a\u0645', '\u0631\u067e\u0648\u0631\u0679', '\u062c\u0645\u0639 \u06a9\u0631\u0627\u0646\u06d2 \u06a9\u0627 \u0648\u0642\u062a']
    : ['Staff Name', 'Branch', 'Class', 'Type', 'Report Date', 'Period Start', 'Period End', 'Report', 'Submitted At'];
  const rows = items.map(item => [item.teacher?.name, item.branch?.name, item.class?.name, item.reportType, item.reportDate, item.periodStart, item.periodEnd, JSON.stringify(item.contentJson), item.submittedAt.toISOString()].map(csvCell).join(','));
  return `${urdu ? '\uFEFF' : ''}${headings.map(csvCell).join(',')}\n${rows.join('\n')}`;
};

const createReportController = service => ({
  create: async (req, res) => sendSuccess(res, { statusCode: 201, message: 'Report submitted successfully.', data: await service.create(req.auth.userId, req.validated.body) }),
  mine: async (req, res) => { const result = await service.mine(req.auth.userId, req.validated.query); return sendSuccess(res, { message: 'Reports loaded.', data: result.items, meta: result.pagination }); },
  teacherDetail: async (req, res) => sendSuccess(res, { message: 'Report loaded.', data: await service.detail(req.validated.params.id, req.auth.userId) }),
  adminDetail: async (req, res) => sendSuccess(res, { message: 'Report loaded.', data: await service.detail(req.validated.params.id) }),
  history: async (req, res) => sendSuccess(res, { message: 'Report edit history loaded.', data: await service.history(req.validated.params.id) }),
  update: async (req, res) => sendSuccess(res, { message: 'Report updated.', data: await service.update(req.validated.params.id, req.validated.body, req.auth, { ip: req.ip, userAgent: req.get('user-agent') || null }) }),
  admin: async (req, res) => { const result = await service.admin(req.validated.query); return sendSuccess(res, { message: 'Reports loaded.', data: result.items, meta: result.pagination }); },
  exportCsv: async (req, res) => { const language = req.validated.query.language || (String(req.get('accept-language')).toLowerCase().startsWith('ur') ? 'ur' : 'en'); return res.type('text/csv; charset=utf-8').attachment(`staff-reports-${new Date().toISOString().slice(0, 10)}.csv`).send(csv(await service.export(req.validated.query), language)); },
});

module.exports = { createReportController, csv };

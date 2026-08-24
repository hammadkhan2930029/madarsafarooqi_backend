'use strict';
const { z } = require('zod');
const empty=z.object({}).strict().default({});const id=z.string().regex(/^[1-9]\d*$/);const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/);const status=z.enum(['PENDING','APPROVED','REJECTED']);const pagination={page:z.coerce.number().int().min(1).optional().default(1),limit:z.coerce.number().int().min(1).max(100).optional().default(20)};
const createSchema=z.object({body:z.object({startDate:date,endDate:date,reason:z.string().trim().min(1).max(1000)}).strict(),params:empty,query:empty});
const detailSchema=z.object({body:empty,params:z.object({id}),query:empty});
const mineSchema=z.object({body:empty,params:empty,query:z.object({status:status.optional(),dateFrom:date.optional(),dateTo:date.optional(),...pagination}).strict()});
const adminListSchema=z.object({body:empty,params:empty,query:z.object({teacherId:id.optional(),branchId:id.optional(),classId:id.optional(),status:status.optional(),dateFrom:date.optional(),dateTo:date.optional(),...pagination}).strict()});
const reviewSchema=z.object({body:empty,params:z.object({id}),query:empty});module.exports={adminListSchema,createSchema,detailSchema,mineSchema,reviewSchema};

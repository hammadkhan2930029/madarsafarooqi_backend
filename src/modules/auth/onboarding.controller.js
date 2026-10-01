'use strict';
const { sendSuccess } = require('../../utils/response');
const metadata = req => ({ ip: req.ip, userAgent: req.get('user-agent') || null });
const createOnboardingController = service => ({ status: async (req,res)=>sendSuccess(res,{message:'Onboarding status loaded.',data:await service.status(req.auth.userId)}), upload: async(req,res)=>sendSuccess(res,{message:'Profile image uploaded.',data:await service.uploadProfileImage(req.auth.userId,req.validated.body)}), complete: async(req,res)=>sendSuccess(res,{message:'Onboarding completed.',data:await service.complete(req.auth.userId,req.validated.body,metadata(req))}) });
module.exports = { createOnboardingController };

const express = require('express');
const { configRouter, timelineRouter } = require('./system.routes');

const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/users', require('./user.routes'));
router.use('/leads', require('./lead.routes'));
router.use('/customers', require('./customer.routes'));
router.use('/deals', require('./deal.routes'));
router.use('/activities', require('./activity.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/config', configRouter);
router.use('/timeline', timelineRouter);

module.exports = router;

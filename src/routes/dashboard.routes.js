const express = require('express');
const controller = require('../controllers/dashboard.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const schemas = require('../validators/dashboard.validator');
const { ROLES } = require('../constants');

const router = express.Router();
const { ADMIN, SALES_MANAGER } = ROLES;

router.use(authenticate);

router.get('/summary', validate(schemas.summary), controller.getSummary);
router.get('/pipeline', validate(schemas.pipeline), controller.getPipeline);
router.get('/team-performance', authorize(ADMIN, SALES_MANAGER), validate(schemas.teamPerformance), controller.getTeamPerformance);
router.get('/revenue-trend', authorize(ADMIN, SALES_MANAGER), validate(schemas.revenueTrend), controller.getRevenueTrend);

module.exports = router;

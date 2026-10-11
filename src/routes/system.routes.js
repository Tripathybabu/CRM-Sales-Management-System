const express = require('express');
const controller = require('../controllers/system.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { updateConfig } = require('../validators/config.validator');
const { listTimeline } = require('../validators/timeline.validator');
const { ROLES } = require('../constants');

const configRouter = express.Router();
configRouter.use(authenticate);
configRouter.get('/', controller.getConfig);
configRouter.patch('/', authorize(ROLES.ADMIN), validate(updateConfig), controller.updateConfig);

const timelineRouter = express.Router();
timelineRouter.use(authenticate, authorize(ROLES.ADMIN));
timelineRouter.get('/', validate(listTimeline), controller.listTimeline);

module.exports = { configRouter, timelineRouter };

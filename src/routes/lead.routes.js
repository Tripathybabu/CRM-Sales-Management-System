const express = require('express');
const controller = require('../controllers/lead.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const schemas = require('../validators/lead.validator');
const { entityTimeline } = require('../validators/timeline.validator');
const { ROLES } = require('../constants');

const router = express.Router();
const { ADMIN, SALES_MANAGER } = ROLES;

router.use(authenticate);

router.route('/').get(validate(schemas.listLeads), controller.listLeads).post(validate(schemas.createLead), controller.createLead);

router
  .route('/:id')
  .get(validate(schemas.idParams), controller.getLead)
  .patch(validate(schemas.updateLead), controller.updateLead)
  .delete(authorize(ADMIN, SALES_MANAGER), validate(schemas.idParams), controller.deleteLead);

router.patch('/:id/status', validate(schemas.updateStatus), controller.updateLeadStatus);
router.patch('/:id/assign', authorize(ADMIN, SALES_MANAGER), validate(schemas.assignLead), controller.assignLead);
router.post('/:id/convert', validate(schemas.convertLead), controller.convertLead);
router.get('/:id/timeline', validate(entityTimeline), controller.getLeadTimeline);

module.exports = router;

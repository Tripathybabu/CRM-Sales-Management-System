const express = require('express');
const controller = require('../controllers/deal.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const schemas = require('../validators/deal.validator');
const { entityTimeline } = require('../validators/timeline.validator');
const { ROLES } = require('../constants');

const router = express.Router();
const { ADMIN, SALES_MANAGER } = ROLES;

router.use(authenticate);

router.route('/').get(validate(schemas.listDeals), controller.listDeals).post(validate(schemas.createDeal), controller.createDeal);

router
  .route('/:id')
  .get(validate(schemas.idParams), controller.getDeal)
  .patch(validate(schemas.updateDeal), controller.updateDeal)
  .delete(authorize(ADMIN, SALES_MANAGER), validate(schemas.idParams), controller.deleteDeal);

router.patch('/:id/stage', validate(schemas.changeStage), controller.changeDealStage);
router.patch('/:id/assign', authorize(ADMIN, SALES_MANAGER), validate(schemas.assignDeal), controller.assignDeal);
router.get('/:id/timeline', validate(entityTimeline), controller.getDealTimeline);

module.exports = router;

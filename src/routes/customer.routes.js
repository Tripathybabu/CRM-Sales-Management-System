const express = require('express');
const controller = require('../controllers/customer.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const schemas = require('../validators/customer.validator');
const { entityTimeline } = require('../validators/timeline.validator');
const { ROLES } = require('../constants');

const router = express.Router();
const { ADMIN, SALES_MANAGER } = ROLES;

router.use(authenticate);

router
  .route('/')
  .get(validate(schemas.listCustomers), controller.listCustomers)
  .post(validate(schemas.createCustomer), controller.createCustomer);

router
  .route('/:id')
  .get(validate(schemas.idParams), controller.getCustomer)
  .patch(validate(schemas.updateCustomer), controller.updateCustomer)
  .delete(authorize(ADMIN, SALES_MANAGER), validate(schemas.idParams), controller.deleteCustomer);

router.patch('/:id/assign', authorize(ADMIN, SALES_MANAGER), validate(schemas.assignCustomer), controller.assignCustomer);
router.get('/:id/timeline', validate(entityTimeline), controller.getCustomerTimeline);

module.exports = router;

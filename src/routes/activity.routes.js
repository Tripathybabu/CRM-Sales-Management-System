const express = require('express');
const controller = require('../controllers/activity.controller');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const schemas = require('../validators/activity.validator');

const router = express.Router();

router.use(authenticate);

router
  .route('/')
  .get(validate(schemas.listActivities), controller.listActivities)
  .post(validate(schemas.createActivity), controller.createActivity);

router
  .route('/:id')
  .get(validate(schemas.idParams), controller.getActivity)
  .patch(validate(schemas.updateActivity), controller.updateActivity)
  .delete(validate(schemas.idParams), controller.deleteActivity);

router.patch('/:id/complete', validate(schemas.completeActivity), controller.completeActivity);

module.exports = router;

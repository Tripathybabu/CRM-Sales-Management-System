const express = require('express');
const controller = require('../controllers/user.controller');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const schemas = require('../validators/user.validator');
const { ROLES } = require('../constants');

const router = express.Router();
const { ADMIN, SALES_MANAGER } = ROLES;

router.use(authenticate);

router
  .route('/')
  .get(authorize(ADMIN, SALES_MANAGER), validate(schemas.listUsers), controller.listUsers)
  .post(authorize(ADMIN), validate(schemas.createUser), controller.createUser);

router
  .route('/:id')
  .get(authorize(ADMIN, SALES_MANAGER), validate(schemas.idParams), controller.getUser)
  .patch(authorize(ADMIN), validate(schemas.updateUser), controller.updateUser)
  .delete(authorize(ADMIN), validate(schemas.idParams), controller.deleteUser);

router.patch('/:id/status', authorize(ADMIN), validate(schemas.updateStatus), controller.updateUserStatus);

module.exports = router;

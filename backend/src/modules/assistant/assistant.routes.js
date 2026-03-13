/**
 * Роуты помощника
 */

const express = require('express');
const controller = require('./assistant.controller');

const router = express.Router();

router.post('/query', controller.query);

module.exports = router;

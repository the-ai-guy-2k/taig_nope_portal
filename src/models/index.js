'use strict';

const schemas = require('./schemas');
const validator = require('./validator');
const loader = require('./loader');

module.exports = {
  ...schemas,
  ...validator,
  ...loader,
};

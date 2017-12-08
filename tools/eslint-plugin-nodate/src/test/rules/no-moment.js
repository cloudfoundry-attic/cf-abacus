'use strict';

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

const rule = require('../../../src/rules/no-moment'),
  RuleTester = require('eslint').RuleTester;

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

const ruleTester = new RuleTester();
ruleTester.run('no-moment', rule, {
  valid: ["var moment = require('abacus-moment')"],

  invalid: [
    {
      code: "var moment = require('moment')",
      errors: [
        {
          message: 'Direct requiring of moment.js is prohibited. ' + 'Use `abacus-moment` library instead.',
          type: 'CallExpression'
        }
      ]
    }
  ]
});

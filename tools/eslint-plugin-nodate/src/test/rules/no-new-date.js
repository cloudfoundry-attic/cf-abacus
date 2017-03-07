'use strict';

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

const rule = require('../../../src/rules/no-new-date'),
  RuleTester = require('eslint').RuleTester;

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

const ruleTester = new RuleTester();
ruleTester.run('no-new-date', rule, {
  valid: [
    'var time = moments().now'
  ],

  invalid: [
    {
      code: 'var time = new Date()',
      errors: [{
        message: 'Direct usage of Date class is prohibited. ' +
          'Use `abacus-moment` library instead.',
        type: 'NewExpression'
      }]
    }
  ]
});

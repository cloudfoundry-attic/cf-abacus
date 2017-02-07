'use strict';

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

const rule = require('../../../src/rules/no-date'),
  RuleTester = require('eslint').RuleTester;

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

const ruleTester = new RuleTester();
ruleTester.run('no-date', rule, {

  valid: [
    'var time = moments().now'
  ],

  invalid: [
    {
      code: 'var time = Date.now()',
      errors: [{
        message: 'Direct reference of Date class is prohibited. ' +
          'Use `abacus-moment` library instead.',
        type: 'MemberExpression'
      }]
    }
  ]
});

'use strict';

// -----------------------------------------------------------------------------
// Requirements
// -----------------------------------------------------------------------------

const rule = require('../../../src/rules/no-moment-without-utc'),
  RuleTester = require('eslint').RuleTester;

// -----------------------------------------------------------------------------
// Tests
// -----------------------------------------------------------------------------

const ruleTester = new RuleTester();
ruleTester.run('no-moment-without-utc', rule, {
  valid: ['var time = moment.utc(123)'],

  invalid: [
    {
      code: 'var time = moment(123).utc()',
      errors: [
        {
          message: 'Non-utc time. Use `abacus-moment.utc()` instead',
          type: 'CallExpression'
        }
      ]
    },
    {
      code: 'var time = moment()',
      errors: [
        {
          message: 'Non-utc time. Use `abacus-moment.utc()` instead',
          type: 'CallExpression'
        }
      ]
    }
  ]
});

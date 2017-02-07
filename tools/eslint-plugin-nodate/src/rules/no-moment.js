'use strict';

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = {
  meta: {
    docs: {
      description: 'Disallow direct requiring of moment.js',
      category: 'Stylistic Issues',
      recommended: false
    },

    schema: []
  },

  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.name === 'require' &&
          node.arguments[0].value === 'moment')
          context.report({
            node,
            message: 'Direct requiring of moment.js is prohibited. ' +
            'Use `abacus-moment` library instead.'
          });
      }
    };
  }
};

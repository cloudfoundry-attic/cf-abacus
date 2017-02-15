'use strict';

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = {
  meta: {
    docs: {
      description: 'Disallow usage of new Date()',
      category: 'Stylistic Issues',
      recommended: false
    },

    schema: []
  },

  create(context) {
    return {
      NewExpression(node) {
        if (node.callee.name === 'Date')
          context.report({
            node,
            message: 'Direct usage of Date class is prohibited. ' +
              'Use `abacus-moment` library instead.'
          });
      }
    };
  }
};

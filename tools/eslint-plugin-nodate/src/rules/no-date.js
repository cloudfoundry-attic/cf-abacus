'use strict';

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = {
  meta: {
    docs: {
      description: 'Disallow reference of Date',
      category: 'Stylistic Issues',
      recommended: false
    },

    schema: []
  },

  create(context) {
    return {
      MemberExpression(node) {
        if (node.object.name === 'Date')
          context.report({
            node,
            message: 'Direct reference of Date class is prohibited. ' +
            'Use `abacus-moment` library instead.'
          });
      }
    };
  }
};

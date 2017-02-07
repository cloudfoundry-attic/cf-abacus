'use strict';

// -----------------------------------------------------------------------------
// Rule Definition
// -----------------------------------------------------------------------------

module.exports = {
  meta: {
    docs: {
      description: 'Disallow use of moment(<ms>).utc()',
      category: 'Stylistic Issues',
      recommended: false
    },

    schema: []
  },

  create(context) {
    return {
      CallExpression(node) {
        if (node.callee.name === 'moment')
          context.report({
            node,
            message: 'Non-utc time. Use `abacus-moment.utc()` instead'
        });
      }
    };
  }
};

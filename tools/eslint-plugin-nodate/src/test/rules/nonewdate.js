"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var rule = require("../../../src/rules/nonewdate"),

RuleTester = require("eslint").RuleTester;


//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

var ruleTester = new RuleTester();
ruleTester.run("nonewdate", rule, {

    valid: [
        "var time = moments().now"
    ],

    invalid: [
        {
            code: "var time = new Date()",
            errors: [{
                message: "Direct usage of Date class is prohibited. Use abacus-moment library instead.",
                type: "NewExpression"
            }]
        }
    ]
});

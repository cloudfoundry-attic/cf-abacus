"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var rule = require("../../../src/rules/nodate"),

RuleTester = require("eslint").RuleTester;

//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

var ruleTester = new RuleTester();
ruleTester.run("nodate", rule, {

    valid: [
        "var time = moments().now"
    ],

    invalid: [
        {
            code: "var time = Date.now()",
            errors: [{
                message: "Direct reference of Date class is prohibited. Use abacus-moment library instead.",
                type: "MemberExpression"
            }]
        }
    ]
});

"use strict";

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

var rule = require("../../../src/rules/nomoment"),

RuleTester = require("eslint").RuleTester;


//------------------------------------------------------------------------------
// Tests
//------------------------------------------------------------------------------

var ruleTester = new RuleTester();
ruleTester.run("nomoment", rule, {

    valid: [
        "var moment = require('abacus-moment')"
    ],

    invalid: [
        {
            code: "var moment = require('moment')",
            errors: [{
                message: "Direct requiring of moment.js is prohibited. Use abacus-moment library instead.",
                type: "CallExpression"
            }]
        }
    ]
});

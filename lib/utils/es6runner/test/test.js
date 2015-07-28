'use strict';

// A simple runner for ES6 scripts.

const _ = require('underscore');
const path = require('path');
const fs = require('fs');

const extend = _.extend;

/* eslint no-eval: 1 */
/* jshint evil: true */

// Mock the fs module used by the runner
const mockfs = {
    files: [],
    readFileSync: spy(function(file, enc) {
        return mockfs.files[file];
    })
};

extend(fs, mockfs);

const es6runner = require('..');

describe('cf-abacus-es6runner', function() {
    let ev;
    beforeEach(() => {
        // Setup an eval mock
        ev = global.eval;
        global.eval = function() { throw new Error(); };
    });
    afterEach(() => {
        // Restore original eval
        global.eval = ev;
    });

    it('transforms ES6 code', function() {
        // Set up the ES6 runner
        es6runner();

        // Simulate a require of an internal module
        const file = path.join(process.cwd(), 'foo.js');
        mockfs.files[file] = 'const x = 10;';
        const module = { _compile: spy() };
        require.extensions['.js'](module, file);

        // Expect the module to be transformed to ES5
        expect(module._compile.args[0]).to.match(/var x = 10/);
    });

    it('does not transforms external dependencies', function() {
        // Set up the ES6 runner
        es6runner();

        // Simulate a require of an external dependency
        const file = path.join(process.cwd(), 'node_modules/foo/bar.js');
        mockfs.files[file] = 'const x = 10;';
        const module = { _compile: spy() };
        require.extensions['.js'](module, file);

        // Expect the module to not be transformed
        expect(module._compile.args[0]).to.match(/const x = 10/);
    });
});


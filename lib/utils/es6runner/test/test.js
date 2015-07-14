'use strict';

// A simple runner for ES6 scripts.

var proxyquire = require('proxyquire');
var path = require('path');

// Mock the fs module used by the runner
const mockfs = {
    files: [],
    readFileSync: spy(function(file, enc) {
        return mockfs.files[file];
    })
};

var es6runner = proxyquire('..', { fs: mockfs });

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
        var file = path.join(process.cwd(), 'foo.js');
        mockfs.files[file] = 'const x = 10;';
        var module = { _compile: spy() };
        require.extensions['.js'](module, file);

        // Expect the module to be transformed to ES5
        expect(module._compile.args[0]).to.match(/var x = 10/);
    });

    it('does not transforms external dependencies', function() {
        // Set up the ES6 runner
        es6runner();

        // Simulate a require of an external dependency
        var file = path.join(process.cwd(), 'node_modules/foo/bar.js');
        mockfs.files[file] = 'const x = 10;';
        var module = { _compile: spy() };
        require.extensions['.js'](module, file);

        // Expect the module to not be transformed
        expect(module._compile.args[0]).to.match(/const x = 10/);
    });
});


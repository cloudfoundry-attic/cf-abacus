abacus-mocha
===

Painless testing and code coverage with Mocha and Istanbul.

The mocha and abacus-mocha executables support the following options:
```
-f, --file <suffix>    test file should end with the suffix provided; Default: test.js
--no-color             do not colorify output')
--grep <pattern>       only run tests matching <pattern>
--fgrep <string>       only run tests containing <string>
--invert               inverts --grep and --fgrep matches'
-t, --timeout <number> timeout in ms; Default: 60000 ms
```

The module exposes the following global utility functionality:
- chai: Chai module
- expect: Chai `expect`
- assertPromise: Chai `assert`
- sinon: Sinon module
- spy: Sinon `spy`
- stub: Sinon `stub`
- assert: Sinon `assert`
- stubModule: function for stubbing modules
- eventually: function for retrying until an expectation is met or interval times out
- setEventuallyPollingInterval: sets `eventually` polling interval
- setEventuallyTimeout: sets `eventually` timeout
- resetEventuallyConfig: resets `eventually` configuration

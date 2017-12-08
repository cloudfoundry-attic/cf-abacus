'use strict';

const launcher = require('..');

describe('launcher', () => {
  it('uses UTC timezone', (done) => {
    process.argv.push('--', 'node', '-e', "if (process.env.TZ != 'UTC') exit(1)");

    const childProcess = launcher.runCLI();

    childProcess.on('close', (code) => {
      expect(code).to.equal(0);
      done();
    });
  });
});

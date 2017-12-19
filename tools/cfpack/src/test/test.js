'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const rimraf = require('rimraf');
const cfpack = require('../index.js');

describe('CF Pack', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foo-'));
  const shrinkwrapJSON = path.join(tempDir, 'npm-shrinkwrap.json');

  before(() => {
    fs.copyFileSync(
      path.join(__dirname, 'package.test.json'),
      path.join(tempDir, 'package.json')
    );
    fs.copyFileSync(
      path.join(__dirname, 'npm-shrinkwrap.test.json'),
      shrinkwrapJSON
    );
    process.chdir(tempDir);
  });

  after(() => {
    rimraf.sync(tempDir);
  });

  context('When executing CF pack command', () => {
    it('should repackage modules correctly', (done) => {
      cfpack.run(path.resolve(`${__dirname}/../../../../`), undefined, (err) => {
        expect(err).to.equal(undefined);
        const npmShrinkwrapJson = require(path.join(tempDir, '.cfpack/npm-shrinkwrap.json'));
        const npmShrinkwrapJsonOrig = require(shrinkwrapJSON);
        const packageJson = require(path.join(tempDir, '.cfpack/package.json'));
        expect(packageJson.dependencies['abacus-batch']).to.equal(
          npmShrinkwrapJson.dependencies['abacus-batch'].resolved
        );
        expect(npmShrinkwrapJsonOrig.dependencies.underscore).to.deep.equal(npmShrinkwrapJson.dependencies.underscore);
        done();
      });
    });
  });
});

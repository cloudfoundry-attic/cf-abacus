'use strict';

const path = require('path');
const rimraf = require('rimraf');
const fs = require('fs');
const cfpack = require('../index.js');

describe('CF Pack', () => {
  before((done) => {
    process.chdir(__dirname);
    if (fs.existsSync('.cfpack'))
      rimraf('.cfpack', () => {
        done();
      });
    else
      done();
  });

  context('When executing CF pack command', () => {
    it('should repackage modules correctly', (done) => {
      cfpack.run(path.resolve('../../../../'), undefined, (err) => {
        expect(err).to.equal(undefined);
        const npmShrinkwrapJson = require('./.cfpack/npm-shrinkwrap.json');
        const npmShrinkwrapJsonOrig = require('./npm-shrinkwrap.json');
        const packageJson = require('./.cfpack/package.json');
        expect(packageJson.dependencies['abacus-batch']).
          to.equal(npmShrinkwrapJson.dependencies['abacus-batch'].resolved);
        expect(npmShrinkwrapJsonOrig.dependencies.underscore).
          to.deep.equal(npmShrinkwrapJson.dependencies.underscore);
        done();
      });
    });
  });
});

'use strict';

const fs = require('fs-extra');
const remanifester = require('../lib/manifest.js');
const yaml = require('js-yaml');

const testAppName = 'test-app-name';
const testDomain = 'domain.com';
const minimalManifestContent = `
      applications:
        - name: test-application
          path: test-path
      `;
const routeWithDomainManifestContent = `
      applications:
        - name: test-application
          path: test-path
          route: test-application.${testDomain}
      `;
const manifestRelativePath = 'path';
const unexistingManifestPath = 'error';
const { originalManifestFilename } = require(`${__dirname}/../lib/constants.js`);

describe('adjusting manifest', () => {
  context('when wrong manifest is provided', () => {
    it('should fail if no application is available', () => {
      expect(() => remanifester.adjustManifest('wrong_manifest:', {})).to.throw(Error);
    });

    it('should fail if no path is available', () => {
      const preparedManifest = `
      applications:
        - name: test-application
      `;
      expect(() => remanifester.adjustManifest(preparedManifest, {})).to.throw(Error);
    });
  });

  context('should return the same manifest', () => {
    it('when undefined properties are provided', () => {
      const adjustedManifest = remanifester.adjustManifest(minimalManifestContent, undefined);
      expect(adjustedManifest).to.equal(minimalManifestContent);
    });

    it('when empty properties are provided', () => {
      const adjustedManifest = remanifester.adjustManifest(minimalManifestContent, {});
      expect(adjustedManifest).to.equal(minimalManifestContent);
    });
  });

  context('adjusting mandatory properties', () => {
    const test = (content, prefix, expectedAppName, domain) => {
      const adjustedManifest = remanifester.adjustManifest(content, { name: testAppName, prefix: prefix });

      const manifest = yaml.load(adjustedManifest);
      expect(manifest.applications.length).to.equal(1);
      const application = manifest.applications[0];
      expect(Object.keys(application)).to.deep.equal(['name', 'path', 'route']);
      expect(application.name).to.equal(expectedAppName);
      expect(application.route).to.equal(domain ? `${expectedAppName}.${domain}` : expectedAppName);
      expect(application.path).to.equal('../test-path');
    };

    it('when application prefix is provided', () => {
      const testAppPrefix = 'test-app-prefix-';
      test(minimalManifestContent, testAppPrefix, testAppPrefix + testAppName);
    });

    it('when application prefix is NOT provided', () => {
      test(minimalManifestContent, undefined, testAppName);
    });

    it('when route contains domain name', () => {
      test(routeWithDomainManifestContent, undefined, testAppName, testDomain);
    });
  });

  context('when optional properties are provided', () => {
    const mandatoryPropertiesNames = ['name', 'path', 'route'];

    const properties = (propertyName, propertyValue) => {
      const props = {
        name: testAppName,
        path: 'test-path'
      };
      props[propertyName] = propertyValue;

      return props;
    };

    const veryfyOptionalProperty = (properties, expectedPropertyName, expectedPropertyValue) => {
      const adjustedManifest = remanifester.adjustManifest(minimalManifestContent, properties);

      const manifest = yaml.load(adjustedManifest);
      expect(manifest.applications.length).to.equal(1);
      expect(Object.keys(manifest.applications[0])).to.deep.equal(
        mandatoryPropertiesNames.concat([expectedPropertyName])
      );
      expect(manifest.applications[0][expectedPropertyName]).to.deep.equal(expectedPropertyValue);
    };

    it('should adjust manifest instances', () => {
      veryfyOptionalProperty(properties('instances', 1), 'instances', 1);
    });

    it('should adjust manifest buildpack', () => {
      veryfyOptionalProperty(properties('buildpack', 'test-buildpack'), 'buildpack', 'test-buildpack');
    });

    it('should adjust manifest configuration', () => {
      veryfyOptionalProperty(properties('conf', 'test-conf'), 'env', { CONF: 'test-conf' });
    });
  });
});

describe('blue-green', () => {
  context('without zdm flag in manifest', () => {
    before(() => {
      const readFileSyncStub = stub(fs, 'readFileSync');
      readFileSyncStub.withArgs(`${process.cwd()}/${manifestRelativePath}/${originalManifestFilename}`)
        .returns(minimalManifestContent);
      readFileSyncStub.withArgs(`${process.cwd()}/${unexistingManifestPath}/${originalManifestFilename}`)
        .throws(new Error());
    });

    after(() => {
      fs.readFileSync.restore();
    });

    it('with app path returns false', () => {
      expect(remanifester.blueGreen(manifestRelativePath)).to.equal(false);
    });

    it('without app path returns false', () => {
      expect(remanifester.blueGreen()).to.equal(false);
    });
  });

  context('with "zdm: true" in manifest', () => {
    before(() => {
      const zdmTrueManifestContent = `
      applications:
        - name: test-application
          path: test-path
          zdm: true
      `;

      const readFileSyncStub = stub(fs, 'readFileSync');
      readFileSyncStub.withArgs(`${process.cwd()}/${manifestRelativePath}/${originalManifestFilename}`)
        .returns(zdmTrueManifestContent);
      readFileSyncStub.withArgs(`${process.cwd()}/${unexistingManifestPath}/${originalManifestFilename}`)
        .throws(new Error());
    });

    after(() => {
      fs.readFileSync.restore();
    });

    it('with app path returns true', () => {
      expect(remanifester.blueGreen(manifestRelativePath)).to.equal(true);
    });

    it('without app path returns false', () => {
      expect(remanifester.blueGreen()).to.equal(false);
    });
  });

  context('with "zdm: false" in manifest', () => {
    before(() => {
      const zdmFalseManifestContent = `
      applications:
        - name: test-application
          path: test-path
          zdm: false
      `;

      const readFileSyncStub = stub(fs, 'readFileSync');
      readFileSyncStub.withArgs(`${process.cwd()}/${manifestRelativePath}/${originalManifestFilename}`)
        .returns(zdmFalseManifestContent);
      readFileSyncStub.withArgs(`${process.cwd()}/${unexistingManifestPath}/${originalManifestFilename}`)
        .throws(new Error());
    });

    after(() => {
      fs.readFileSync.restore();
    });

    it('with app path returns false', () => {
      expect(remanifester.blueGreen(manifestRelativePath)).to.equal(false);
    });

    it('without app path returns false', () => {
      expect(remanifester.blueGreen()).to.equal(false);
    });
  });
});

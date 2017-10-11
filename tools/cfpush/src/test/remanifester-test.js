'use strict';

const yaml = require('js-yaml');
const remanifester = require('../lib/remanifester.js');

describe('Test adjusting manifest', () => {

  context('when wrong manifest is provided', () => {

    it('should fail if no application is available', () => {
      expect(() => remanifester.adjustManifest('wrong_manifest:', {}))
        .to.throw(Error);
    });

    it('should fail if no path is available', () => {
      const preparedManifest = `
      applications:
        - name: test-application
      `;
      expect(() => remanifester.adjustManifest(preparedManifest, {}))
        .to.throw(Error);
    });

  });

  const testAppName = 'test-app-name';
  const preparedManifest = `
      applications:
        - name: test-application
          path: test-path
      `;

  context('should return the same manifest', () => {

    it('when undefined properties are provided', () => {
      const adjustedManifest = remanifester
        .adjustManifest(preparedManifest, undefined);
      expect(adjustedManifest).to.equal(preparedManifest);
    });

    it('when empty properties are provided', () => {
      const adjustedManifest = remanifester
        .adjustManifest(preparedManifest, {});
      expect(adjustedManifest).to.equal(preparedManifest);
    });

  });

  context('adjusting mandatory properties', () => {
    const test = (prefix, expectedAppName) => {
      const adjustedManifest = remanifester
        .adjustManifest(preparedManifest,
          { name: testAppName, prefix: prefix });

      const manifest = yaml.load(adjustedManifest);
      expect(manifest.applications.length).to.equal(1);
      const application = manifest.applications[0];
      expect(Object.keys(application)).to.deep.equal(['name', 'path', 'host']);
      expect(application.name).to.equal(expectedAppName);
      expect(application.host).to.equal(expectedAppName);
      expect(application.path).to.equal('../test-path');
    };

    it('when application prefix is provided', () => {
      const testAppPrefix = 'test-app-prefix-';
      test(testAppPrefix, testAppPrefix + testAppName);
    });

    it('when application prefix is NOT provided', () => {
      test(undefined, testAppName);
    });
  });

  context('when optional properties are provided', () => {
    const mandatoryPropertiesNames = ['name', 'path', 'host'];

    const properties = (propertyName, propertyValue) => {
      const props = {
        name: testAppName,
        path: 'test-path'
      };
      props[propertyName] = propertyValue;

      return props;
    };

    const veryfyOptionalProperty = (properties,
      expectedPropertyName, expectedPropertyValue) => {

      const adjustedManifest = remanifester
        .adjustManifest(preparedManifest, properties);

      const manifest = yaml.load(adjustedManifest);
      expect(manifest.applications.length).to.equal(1);
      expect(Object.keys(manifest.applications[0]))
        .to.deep.equal(mandatoryPropertiesNames.concat([expectedPropertyName]));
      expect(manifest.applications[0][expectedPropertyName])
        .to.deep.equal(expectedPropertyValue);
    };

    it('should adjust manifest instances', () => {
      veryfyOptionalProperty(properties('instances', 1), 'instances', 1);
    });

    it('should adjust manifest buildpack', () => {
      veryfyOptionalProperty(properties('buildpack', 'test-buildpack'),
        'buildpack', 'test-buildpack');
    });

    it('should adjust manifest configuration', () => {
      veryfyOptionalProperty(properties('conf', 'test-conf'),
        'env', { CONF: 'test-conf' });
    });

  });

});

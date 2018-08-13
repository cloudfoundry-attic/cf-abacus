'use strict';

const createAppsUrisBuilder = require('../lib/apps-uris-builder');

describe('healthchecker/apps-uris-builder', () => {
  const groupName = 'aggregator';
  let sandbox;
  let appsUrisBuilder;

  beforeEach(() => {
    sandbox = sinon.createSandbox();
  });

  const tests = (groupUri, expectedAppsUris) => {
    beforeEach(() => {
      const urienvStub = {
        url: sandbox.stub().returns(groupUri)
      };
      appsUrisBuilder = createAppsUrisBuilder(urienvStub);
    });

    context('when group contains only one app', () => {
      it('should return the group uri', async() => {
        const appsUris = await appsUrisBuilder.buildUris(groupName, 1);
        expect(appsUris).to.deep.equal([groupUri]);
      });
    });

    context('when group contains multiple apps', () => {
      it('should return the applications uris ', async() => {
        const appsUris = await appsUrisBuilder.buildUris(groupName, 3);
        expect(appsUris).to.deep.equal(expectedAppsUris);
      });
    });
  };

  context('when group uri is localhost', () => {
    const groupUri = 'http://localhost:8090';

    tests(groupUri, [
      'http://localhost:8090',
      'http://localhost:8091',
      'http://localhost:8092'
    ]);
  });

  context('when group uri is a domain name', () => {
    const groupUri = `http://${groupName}.domain.name.com`;

    tests(groupUri, [
      `http://${groupName}-0.domain.name.com`,
      `http://${groupName}-1.domain.name.com`,
      `http://${groupName}-2.domain.name.com`
    ]);
  });

});

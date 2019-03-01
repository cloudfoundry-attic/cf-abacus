'use strict';

const serviceGuidExtractor = require('../service-guid-extractor');

describe('service-guid-extractor', () => {
  let services;
  let guids;

  context('when there are no services', () => {
    beforeEach(() => {
      services = {};
      guids = serviceGuidExtractor.extractGuids(services);
    });

    it('returns empty array', () => {
      expect(guids).to.deep.equal([]);
    });
  });

  context('when there are multiple services with guids', () => {
    beforeEach(() => {
      services = {
        mongodb: {
          guids: ['guid1', 'guid2']
        },
        postgresql: {
          guids: ['guid3']
        },
        redis: {
          plan: ['small']
        }
      };
      guids = serviceGuidExtractor.extractGuids(services);
    });

    it('returns only guids', () => {
      expect(guids).to.deep.equal(['guid1', 'guid2', 'guid3']);
    });
  });

  context('when there are services without guids', () => {
    beforeEach(() => {
      services = {
        mongodb: {
        },
        redis: {
          plan: ['small']
        }
      };
      guids = serviceGuidExtractor.extractGuids(services);
    });

    it('returns empty array', () => {
      expect(guids).to.deep.equal([]);
    });
  });
});

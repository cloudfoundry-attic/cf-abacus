'use strict';

const createOrgFilter = require('../org-filter');

describe('org-filter', () => {
  const allowedOrgs = ['org-1', 'org-2'];

  let filter;
  let event;

  beforeEach(() => {
    filter = createOrgFilter(allowedOrgs);
  });

  context('when event org is allowed', () => {
    beforeEach(() => {
      event = {
        entity: {
          org_guid: 'org-1'
        }
      };
    });

    it('does not mark event for filtering', () => {
      expect(filter(event)).to.equal(false);
    });
  });

  context('when org is not allowed', () => {
    beforeEach(() => {
      event = {
        entity: {
          org_guid: 'org-unspecified'
        }
      };
    });

    it('marks event for filtering', () => {
      expect(filter(event)).to.equal(true);
    });
  });
});

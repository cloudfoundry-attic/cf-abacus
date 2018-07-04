'use strict';

const { pick } = require('underscore');
const moment = require('abacus-moment');
const { newSpace, reviveSpace } = require('../lib/models');


describe('models test', () => {
  process.env.SLACK = '2D';

  const id = 'id';

  let space;

  beforeEach(() => {
    space = newSpace('space-id');
    reviveSpace(space);
  });

  context('when consumers are missing', () => {
    const time = moment.now().toString();

    beforeEach(() => {
      space.consumers = undefined;
      space.consumer(id, time);
    });

    it('should create new consumer', () => {
      expect(space.consumers.length).to.equal(1);
      expect(space.consumers).to.deep.equal([{ id: id, t: time }]);
    });
  });

  context('when resources are missing', () => {

    beforeEach(() => {
      space.resources = undefined;
      space.resource(id);
    });

    it('should create new resource', () => {
      expect(space.resources.length).to.equal(1);
      expect(pick(space.resources[0], 'resource_id', 'plans')).to.deep.equal({ resource_id: id, plans: [] });
    });
  });
});

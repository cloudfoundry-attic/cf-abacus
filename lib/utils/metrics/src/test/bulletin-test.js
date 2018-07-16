'use strict';

const { Bulletin } = require('../lib/bulletin');

describe('bulletin', () => {
  let bulletin;

  beforeEach(() => {
    bulletin = new Bulletin('bulletin-name');
  });

  it('is possible to get name', () => {
    expect(bulletin.name).to.equal('bulletin-name');
  });

  it('has default capacity of 3', () => {
    expect(bulletin.capacity).to.equal(3);
  });

  describe('summary', () => {
    describe('lines', () => {
      const getLines = () => {
        const summary = bulletin.summary();
        return summary.posts;
      };

      it('handles no posts', () => {
        expect(getLines()).to.deep.equal([]);
      });

      it('handles posts below capacity', () => {
        bulletin.post('first');
        expect(getLines()).to.deep.equal([
          'first'
        ]);
      });

      it('handles posts at capacity', () => {
        bulletin.post('first');
        bulletin.post('second');
        bulletin.post('third');
        expect(getLines()).to.deep.equal([
          'first',
          'second',
          'third'
        ]);
      });

      it('handles posts above capacity (by wrapping around)', () => {
        // fill bulletin
        bulletin.post('first');
        bulletin.post('second');
        bulletin.post('third');

        // just in case, fill it again
        bulletin.post('first');
        bulletin.post('second');
        bulletin.post('third');

        // now add a few odd entries
        bulletin.post('new-first');
        bulletin.post('new-second');

        expect(getLines()).to.deep.equal([
          'third',
          'new-first',
          'new-second'
        ]);
      });
    });
  });
});

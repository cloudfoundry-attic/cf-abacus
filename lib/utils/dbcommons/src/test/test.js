'use strict';

describe('abacus-dbcommons', () => {

  describe('puri', () => {
    const dbops = require('..')();

    it('purifies the URL', () => {
      expect(dbops.puri('https://user:password@example.com')).
        to.equal('https://***:***@example.com');
      expect(dbops.puri('mongodb://user:password@server.host')).
        to.equal('mongodb://***:***@server.host');
    });
  });

  describe('dbify', () => {

    context('with DB that requires id to be missing', () => {
      const dbops = require('..')({ omit_id: true });

      it('removes the id field', () => {
        expect(dbops.dbify({ id: 123 })).to.deep.equal({ _id: 123 });
      });

      it('extends with requested fields', () => {
        expect(dbops.dbify({ id: 123 }, { additional: 345 })).to.deep.equal({
          _id: 123,
          additional: 345
        });
      });
    });

    context('with DB that does not require id to be removed', () => {
      const dbops = require('..')({ omit_id: false });

      it('does not remove the id field', () => {
        expect(dbops.dbify({ id: 123 })).to.deep.equal({
          id: 123,
          _id: 123
        });
      });

      it('extends with requested fields', () => {
        expect(dbops.dbify({ id: 123 }, { additional: 345 })).to.deep.equal({
          id: 123,
          _id: 123,
          additional: 345
        });
      });
    });

    context('by default removes the id', () => {
      const dbops = require('..')();

      it('does not remove the id field', () => {
        expect(dbops.dbify({ id: 123 })).to.deep.equal({
          _id: 123
        });
      });
    });
  });

  describe('undbify', () => {

    context('with DB that requires id to be missing', () => {
      const dbops = require('..')({ omit_id: true });

      it('returns id and removes _id and _rev fields', () => {
        expect(dbops.undbify({
          _id: 123,
          _rev: 12
        })).to.deep.equal({
          id: 123
        });
      });
    });

    context('with DB that does not require id to be removed', () => {
      const dbops = require('..')({ omit_id: false });

      it('returns id and removes _id and _rev fields', () => {
        expect(dbops.undbify({
          _id: 123,
          _rev: 12
        })).to.deep.equal({
          id: 123
        });
      });
    });

  });

  describe('pad16', () => {
    const dbops = require('..')();

    it('pads to 16 digits', () => {
      expect(dbops.pad16('1')).to.equal('0000000000000001');
    });

    it('pads string with leading zeros to 16 digits', () => {
      expect(dbops.pad16('0201')).to.equal('0000000000000201');
    });

    it('pads string bigger than 16 digits to zeros', () => {
      expect(dbops.pad16('3540000000000000001')).to.equal('0000000000000000');
    });
  });

  describe('kturi', () => {
    const dbops = require('..')();

    it('converts key and time to URI', () => {
      expect(dbops.kturi('one', 10)).to.equal('k/one/t/0000000000000010');
    });

    it('converts key to URI', () => {
      expect(dbops.kturi('one')).to.equal('k/one');
    });
  });

  describe('tkuri', () => {
    const dbops = require('..')();

    it('converts time and key to URI', () => {
      expect(dbops.tkuri('one', 10)).to.equal('t/0000000000000010/k/one');
    });

    it('converts time to URI', () => {
      expect(dbops.tkuri(undefined, 10)).to.equal('t/0000000000000010');
    });
  });

  describe('t', () => {
    const dbops = require('..')();

    it('gets time from key-based URI', () => {
      expect(dbops.t('k/one/t/0000000000000010')).to.equal(
        '0000000000000010'
      );
    });

    it('gets time with segments from key-based URI', () => {
      expect(dbops.t('k/one/two/t/0000000000000010/123')).to.equal(
        '0000000000000010/123'
      );
    });

    it('gets time from time-based URI', () => {
      expect(dbops.t('t/0000000000000010/k/one')).to.equal(
        '0000000000000010'
      );
    });

    it('gets time with segments from time-based URI', () => {
      expect(dbops.t('t/0000000000000010/123/k/one/two')).to.equal(
        '0000000000000010/123'
      );
    });

    it('returns undefined if no time present in key-based URI', () => {
      expect(dbops.t('k/one')).to.equal(undefined);
    });
  });

  describe('k', () => {
    const dbops = require('..')();

    it('gets key from key-based URI', () => {
      expect(dbops.k('k/one/t/0000000000000010')).to.equal(
        'one'
      );
    });

    it('gets key with segments from key-based URI', () => {
      expect(dbops.k('k/one/two/t/0000000000000010/123')).to.equal(
        'one/two'
      );
    });

    it('gets key from time-based URI', () => {
      expect(dbops.k('t/0000000000000010/k/one')).to.equal(
        'one'
      );
    });

    it('gets key with segments from time-based URI', () => {
      expect(dbops.k('t/0000000000000010/123/k/one/two')).to.equal(
        'one/two'
      );
    });

    it('returns undefined if no key present in time-based URI', () => {
      expect(dbops.k('t/0000000000000010')).to.equal(undefined);
    });
  });

});

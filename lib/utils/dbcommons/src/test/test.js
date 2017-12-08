'use strict';

const _ = require('underscore');
const extend = _.extend;

describe('abacus-dbcommons', () => {
  describe('puri', () => {
    const dbCommons = require('..')();

    it('purifies the URL', () => {
      expect(dbCommons.puri('https://user:password@example.com')).to.equal('https://***:***@example.com');
      expect(dbCommons.puri('mongodb://user:password@server.host')).to.equal('mongodb://***:***@server.host');
    });
  });

  describe('dbify', () => {
    context('with DB that requires id to be missing', () => {
      const dbCommons = require('..')({ omit_id: true });

      it('removes the id field', () => {
        expect(dbCommons.dbify({ id: 123 })).to.deep.equal({ _id: 123 });
      });

      it('extends with requested fields', () => {
        expect(dbCommons.dbify({ id: 123 }, { field: 345 })).to.deep.equal({
          _id: 123,
          field: 345
        });
      });
    });

    context('with DB that does not require id to be removed', () => {
      const dbCommons = require('..')({ omit_id: false });

      it('does not remove the id field', () => {
        expect(dbCommons.dbify({ id: 123 })).to.deep.equal({
          id: 123,
          _id: 123
        });
      });

      it('extends with requested fields', () => {
        expect(dbCommons.dbify({ id: 123 }, { field: 345 })).to.deep.equal({
          id: 123,
          _id: 123,
          field: 345
        });
      });
    });

    context('by default removes the id', () => {
      const dbCommons = require('..')();

      it('does not remove the id field', () => {
        expect(dbCommons.dbify({ id: 123 })).to.deep.equal({
          _id: 123
        });
      });
    });
  });

  describe('undbify', () => {
    context('with DB that requires id to be missing', () => {
      const dbCommons = require('..')({ omit_id: true });

      it('returns id and removes _id and _rev fields', () => {
        expect(
          dbCommons.undbify({
            _id: 123,
            _rev: 12
          })
        ).to.deep.equal({
          id: 123
        });
      });
    });

    context('with DB that does not require id to be removed', () => {
      const dbCommons = require('..')({ omit_id: false });

      it('returns id and removes _id and _rev fields', () => {
        expect(
          dbCommons.undbify({
            _id: 123,
            _rev: 12
          })
        ).to.deep.equal({
          id: 123
        });
      });
    });
  });

  describe('pad16', () => {
    const dbCommons = require('..')();

    it('pads to 16 digits', () => {
      expect(dbCommons.pad16('1')).to.equal('0000000000000001');
    });

    it('pads string with leading zeros to 16 digits', () => {
      expect(dbCommons.pad16('0201')).to.equal('0000000000000201');
    });

    it('pads string bigger than 16 digits to zeros', () => {
      expect(dbCommons.pad16('3540000000000000001')).to.equal('0000000000000000');
    });
  });

  describe('kturi', () => {
    const dbCommons = require('..')();

    it('converts key and time to URI', () => {
      expect(dbCommons.kturi('one', 10)).to.equal('k/one/t/0000000000000010');
    });

    it('converts key to URI', () => {
      expect(dbCommons.kturi('one')).to.equal('k/one');
    });
  });

  describe('tkuri', () => {
    const dbCommons = require('..')();

    it('converts time and key to URI', () => {
      expect(dbCommons.tkuri('one', 10)).to.equal('t/0000000000000010/k/one');
    });

    it('converts time to URI', () => {
      expect(dbCommons.tkuri(undefined, 10)).to.equal('t/0000000000000010');
    });
  });

  describe('t', () => {
    const dbCommons = require('..')();

    it('gets time from key-based URI', () => {
      expect(dbCommons.t('k/one/t/0000000000000010')).to.equal('0000000000000010');
    });

    it('gets time with segments from key-based URI', () => {
      expect(dbCommons.t('k/one/two/t/0000000000000010/123')).to.equal('0000000000000010/123');
    });

    it('gets time from time-based URI', () => {
      expect(dbCommons.t('t/0000000000000010/k/one')).to.equal('0000000000000010');
    });

    it('gets time with segments from time-based URI', () => {
      expect(dbCommons.t('t/0000000000000010/123/k/one/two')).to.equal('0000000000000010/123');
    });

    it('returns undefined if no time present in key-based URI', () => {
      expect(dbCommons.t('k/one')).to.equal(undefined);
    });
  });

  describe('k', () => {
    const dbCommons = require('..')();

    it('gets key from key-based URI', () => {
      expect(dbCommons.k('k/one/t/0000000000000010')).to.equal('one');
    });

    it('gets key with segments from key-based URI', () => {
      expect(dbCommons.k('k/one/two/t/0000000000000010/123')).to.equal('one/two');
    });

    it('gets key from time-based URI', () => {
      expect(dbCommons.k('t/0000000000000010/k/one')).to.equal('one');
    });

    it('gets key with segments from time-based URI', () => {
      expect(dbCommons.k('t/0000000000000010/123/k/one/two')).to.equal('one/two');
    });

    it('returns undefined if no key present in time-based URI', () => {
      expect(dbCommons.k('t/0000000000000010')).to.equal(undefined);
    });
  });

  describe('readAllPages', () => {
    const dbCommonsModule = require('..');
    const dbCommons = dbCommonsModule();

    const firstPageDocs = [{ i: 1 }, { i: 2 }];
    const secondPageDocs = [{ i: 3 }];
    const emptyDocs = [];

    const processingFnStub = stub();

    const dbClient = { allDocs: () => {} };
    const allDocsStub = stub(dbClient, 'allDocs');

    const pagingOpts = {
      startId: 't/0/start',
      endId: 't/10/end',
      pageSize: 2,
      skip: 0
    };

    const buildDBOpts = (opts) =>
      extend(
        {
          startkey: 't/0/start',
          endkey: 't/10/end',
          include_docs: true,
          limit: 2,
          skip: 0
        },
        opts
      );

    beforeEach(() => {
      processingFnStub.reset();
      allDocsStub.reset();
    });

    context('on success', () => {
      beforeEach(() => {
        processingFnStub.withArgs(firstPageDocs).yields();
        processingFnStub.withArgs(secondPageDocs).yields();
        processingFnStub.throws('Unknown args');

        allDocsStub.onFirstCall().yields(undefined, { rows: firstPageDocs });
        allDocsStub.onSecondCall().yields(undefined, { rows: secondPageDocs });
        allDocsStub.yields(undefined, { rows: emptyDocs });
      });

      it('reads all pages from db', (done) => {
        dbCommons.readAllPages(dbClient, pagingOpts, processingFnStub, (error) => {
          expect(error).to.equal(undefined);

          assert.calledTwice(allDocsStub);
          assert.calledWith(allDocsStub.firstCall, buildDBOpts());
          assert.calledWith(allDocsStub.secondCall, buildDBOpts({ skip: 2 }));

          done();
        });
      });

      it('processes all pages', (done) => {
        dbCommons.readAllPages(dbClient, pagingOpts, processingFnStub, (error) => {
          expect(error).to.equal(undefined);

          assert.calledTwice(processingFnStub);
          assert.calledWith(processingFnStub.firstCall, firstPageDocs);
          assert.calledWith(processingFnStub.secondCall, secondPageDocs);

          done();
        });
      });
    });

    context('on failure reading a page', () => {
      beforeEach(() => {
        processingFnStub.withArgs(firstPageDocs).yields();
        processingFnStub.throws('Unknown args');

        allDocsStub.onFirstCall().yields(undefined, { rows: firstPageDocs });
        allDocsStub.onSecondCall().yields('error');
      });

      it('errors', (done) => {
        dbCommons.readAllPages(dbClient, pagingOpts, processingFnStub, (error) => {
          expect(error).to.equal('error');

          assert.calledOnce(processingFnStub);
          assert.calledWith(processingFnStub, firstPageDocs);

          done();
        });
      });

      it('tries to read two pages from db', (done) => {
        dbCommons.readAllPages(dbClient, pagingOpts, processingFnStub, () => {
          assert.calledTwice(allDocsStub);
          assert.calledWith(allDocsStub.firstCall, buildDBOpts());
          assert.calledWith(allDocsStub.secondCall, buildDBOpts({ skip: 2 }));

          done();
        });
      });
    });

    context('on failure processing a page', () => {
      beforeEach(() => {
        processingFnStub.withArgs(firstPageDocs).yields();
        processingFnStub.yields('processing error');

        allDocsStub.onFirstCall().yields(undefined, { rows: firstPageDocs });
        allDocsStub.onSecondCall().yields(undefined, { rows: secondPageDocs });
        allDocsStub.yields('should not get here happen');
      });

      it('errors', (done) => {
        dbCommons.readAllPages(dbClient, pagingOpts, processingFnStub, (error) => {
          expect(error).to.equal('processing error');

          assert.calledTwice(processingFnStub);
          assert.calledWith(processingFnStub, firstPageDocs);
          assert.calledWith(processingFnStub.secondCall, secondPageDocs);

          done();
        });
      });

      it('reads the first two pages from db', (done) => {
        dbCommons.readAllPages(dbClient, pagingOpts, processingFnStub, () => {
          assert.calledTwice(allDocsStub);
          assert.calledWith(allDocsStub.firstCall, buildDBOpts());
          assert.calledWith(allDocsStub.secondCall, buildDBOpts({ skip: 2 }));

          done();
        });
      });
    });
  });
});

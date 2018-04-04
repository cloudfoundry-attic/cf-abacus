'use strict';

const moment = require('abacus-moment');
const MongoStore = require('../../../lib/middleware/rate-limiter/mongo-store');

describe('MongoStore tests', () => {
  const firstRequestTimestamp = 42;
  const windowMs = 10;

  let sandbox;
  let collection;
  let mongoStore;

  beforeEach(() => {
    sandbox = sinon.sandbox.create();
    collection = {
      findOneAndUpdate: sandbox.stub(),
      update: sandbox.stub()
    };

    mongoStore = new MongoStore(collection, windowMs);
  });

  afterEach(() => {
    sandbox.restore();
  });

  describe('incr', () => {
    const key = 'testKey';

    context('when value is successfully increased', () => {
      const requestsCount = 22;
      let incrResult;

      beforeEach(() => {
        collection.findOneAndUpdate.yields(undefined, {
          value: {
            requestsCount,
            firstRequestTimestamp: firstRequestTimestamp
          }
        });
      });

      context('when db counter is not outdated', () => {
        const secondRequestTimestamp = firstRequestTimestamp + windowMs - 1;

        beforeEach((done) => {
          sandbox.stub(moment, 'now')
            .onFirstCall().returns(firstRequestTimestamp)
            .onSecondCall().returns(secondRequestTimestamp);

          mongoStore.incr(key, (err, result) => {
            incrResult = result;
            done();
          });
        });

        it('db is called with proper arguments', () => {
          assert.calledOnce(collection.findOneAndUpdate);
          assert.calledWith(collection.findOneAndUpdate,
            {
              _id: key
            }, {
              $inc: { requestsCount: 1 },
              $setOnInsert: { firstRequestTimestamp }
            }, {
              upsert: true,
              returnOriginal: false
            });
        });

        it('value is returned', () => {
          expect(incrResult).to.equals(requestsCount);
        });

      });

      context('when db counter is outdated', () => {
        const resetCount = 1;
        const secondRequestTimestamp = firstRequestTimestamp + windowMs + 1;

        beforeEach(() => {
          sandbox.stub(moment, 'now')
            .onFirstCall().returns(firstRequestTimestamp)
            .onSecondCall().returns(secondRequestTimestamp)
            .onThirdCall().returns(secondRequestTimestamp);
        });

        context('when db counter is successfully reset', () => {
          beforeEach((done) => {
            collection.update.yields(undefined, undefined);

            mongoStore.incr(key, (err, result) => {
              incrResult = result;
              done();
            });
          });

          it('reset db counter is returned', () => {
            expect(incrResult).to.equals(resetCount);
          });

          it('db counter is reset in db', () => {
            assert.calledOnce(collection.update);
            assert.calledWith(collection.update, {
              _id: key
            },{
              $set: {
                requestsCount: 1,
                firstRequestTimestamp: secondRequestTimestamp
              }
            });
          });
        });

        context('when db counter is not successfully reset', () => {
          const resetError = new Error('error');

          beforeEach(() => {
            collection.update.yields(resetError, undefined);
          });

          it('error is not propageted', (done) => {
            mongoStore.incr(key, (err, result) => {
              expect(err).to.equals(undefined);
              expect(result).to.equals(1);
              done();
            });
          });
        });
      });
    });

    context('when db counter is not successfully increased', () => {
      let findError = new Error('error');

      beforeEach(() => {
        collection.findOneAndUpdate.yields(findError);
      });

      it('error is not propageted', (done) => {
        mongoStore.incr(key, (err, result) => {
          expect(err).to.equals(undefined);
          expect(result).to.equals(1);
          done();
        });
      });
    });
  });
});

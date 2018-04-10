'use strict';
require('./lib/index.js');
const _ = require('lodash');
const Promise = require('bluebird');
const proxyquire = require('proxyquire');


const responseBody = 'this-is-the-response-body';
const responseObject = {
  statusCode: 200,
  statusMessage: 'HTTP_Status_Message',
  headers: []
};
const expectedResultObject = _.assign({}, responseObject, {
  body: responseBody
});

const HttpClient = proxyquire('../utils/HttpClient', {
  bluebird: {
    promisify(fun) {
      return fun;
    }
  },
  request: {
    defaults(options) {
      return function() {
        return Promise.resolve([
          _.update(_.assign({}, responseObject), 'statusCode', () => {
            return options.respondWithStatusCode || 200;
          }),
          options.respondWithBody || responseBody
        ]);
      };
    }
  }
});

describe('utils', () => {
  describe('HttpClient', () => {
    let httpClient = new HttpClient({});

    describe('request', () => {
      it('returns request result (no error occured)', (done) => {
        let responseStatus = 200;
        httpClient.request({
          expectedStatusCode: responseStatus
        }).then((res) => {
          expect(res).to.eql(expectedResultObject);
          done();
        }).catch(done);
      });

      it('returns request result (no error occured) (no expectedStatusCode)',
        (done) => {
          let responseStatus = 200;
          httpClient.request({
            expectedStatusCode: responseStatus
          }).then((res) => {
            expect(res).to.eql(expectedResultObject);
            done();
          }).catch(done);
        });

      it('throws a BadRequest error', (done) => {
        let responseStatus = 400;
        new HttpClient({
          respondWithStatusCode: responseStatus
        }).request({}, 200)
          .then((res) => {
            expect(res).toBe.eql(expectedResultObject);
          })
          .catch((err) => {
            done();
          });
      });

      it('throws a NotFound error', (done) => {
        let responseStatus = 404;
        new HttpClient({
          respondWithStatusCode: responseStatus
        }).request({}, 200)
          .then(done)
          .catch((err) => {
            expect(err.status).to.equal(responseStatus);
            done();
          });
      });

      it('throws an InternalServerError error', (done) => {
        let responseStatus = 500;
        new HttpClient({
          respondWithStatusCode: responseStatus,
          respondWithBody: {}
        }).request({}, 200)
          .then(done)
          .catch((err) => {
            expect(err.status).to.equal(responseStatus);
            expect(err).to.have.property('error');
            done();
          });
      });

      it('throws Forbidden error', (done) => {
        let responseStatus = 409;
        new HttpClient({
          respondWithStatusCode : responseStatus,
          respondWithBody : {}
        }).request({}, 200)
          .then(done)
          .catch((err) => {
            expect(err.status).to.equal(responseStatus);
            expect(err).to.have.property('error');
            done();
          });
      });
    });
  });
});

'use strict';

const _ = require('underscore');
const extend = _.extend;

const httpStatus = require('http-status-codes');
const config = require('../config.js');

require('abacus-retry');
require.cache[require.resolve('abacus-retry')].exports = (fn) => fn;
require('abacus-breaker');
require.cache[require.resolve('abacus-breaker')].exports = (fn) => fn;
require('abacus-throttle');
require.cache[require.resolve('abacus-throttle')].exports = (fn) => fn;

describe('Unbind service instance', () => {

  context('and delete UAA client', () => {
    let errCode;
    let errMsg;
    let deleteSpy;

    const clientId = config.getClientId('1234567890', '0987654321');

    beforeEach(() => {
      delete require.cache[require.resolve('abacus-request')];
      delete require.cache[require.resolve('../routes/unbind-service.js')];

      deleteSpy = spy((uri, opts, cb) => {
        cb(errMsg, {
          statusCode: errCode,
          body: {}
        });
      });

      const request = require('abacus-request');
      const requestMock = extend({}, request, {
        delete: deleteSpy
      });

      require.cache[require.resolve('abacus-request')].exports = requestMock;
    });

    it('should pass if UAA client is deleted', (done) => {
      errMsg = null;
      errCode = httpStatus.OK;

      const unbindService = require('../routes/unbind-service.js');
      unbindService.deleteUaaClient(clientId, (statusCode) => {
        expect(statusCode).to.equal(httpStatus.OK);
        expect(deleteSpy.callCount).to.equal(1);

        done();
      });
    });

    it('should fail if an error during deletion occur', (done) => {
      errMsg = 'Error';

      const unbindService = require('../routes/unbind-service.js');
      unbindService.deleteUaaClient(clientId, (statusCode) => {
        expect(statusCode).to.equal(httpStatus.INTERNAL_SERVER_ERROR);

        done();
      });
    });

    it('should pass if 404 is returned from authorization server', (done) => {
      errMsg = null;
      errCode = httpStatus.NOT_FOUND;

      const unbindService = require('../routes/unbind-service.js');
      unbindService.deleteUaaClient(clientId, (statusCode) => {
        expect(statusCode).to.equal(httpStatus.OK);

        done();
      });
    });

    it('should pass if 500 is returned from authorization server', (done) => {
      errMsg = null;
      errCode = httpStatus.INTERNAL_SERVER_ERROR;

      const unbindService = require('../routes/unbind-service.js');
      unbindService.deleteUaaClient(clientId, (statusCode) => {
        expect(statusCode).to.equal(httpStatus.INTERNAL_SERVER_ERROR);

        done();
      });
    });
  });
});

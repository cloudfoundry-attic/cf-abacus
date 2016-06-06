'use strict';

const util = require('util');

const _ = require('underscore');
const extend = _.extend;
const range = _.range;

// Configure API URL
process.env.API = 'http://api';

describe('Paging', () => {
  const emptyResponse = {};
  const emptyPage = {
    next_url: null,
    resources: []
  };
  const pageOne = {
    next_url: '/page2',
    resources: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
  };
  const pageTwo = {
    next_url: null,
    resources: [11, 12, 13, 14]
  };

  let reqmock;
  let paging;
  let sandbox;
  let token;
  let perf;

  const deleteModules = () => {
    delete require.cache[require.resolve('abacus-dbclient')];
    delete require.cache[require.resolve('abacus-couchclient')];
    delete require.cache[require.resolve('abacus-mongoclient')];
    delete require.cache[require.resolve('abacus-perf')];
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('../index.js')];
  };

  beforeEach(() => {
    deleteModules();

    perf = require('abacus-perf');

    // Stub timeout with immediate
    sandbox = sinon.sandbox.create();
    sandbox.stub(global, 'setTimeout', setImmediate);
  });

  afterEach(() => {
    sandbox.restore();

    deleteModules();

    reqmock = undefined;
    paging = undefined;
    token = undefined;
    perf = undefined;
  });

  context('on success', () => {
    context('on non-empty page', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            if (opts.page.indexOf('page2') > -1)
              cb(null, { statusCode: 200, body: pageTwo });
            else
              cb(null, { statusCode: 200, body: pageOne });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        token = () => 'token';

        paging = require('../index.js');
      });

      const checkRequest = (req, pageURI) => {
        expect(req[0]).to.equal(':api:page');
        expect(req[1]).to.deep.equal({
          api:'http://api',
          page: pageURI,
          headers: {
            Authorization: 'token'
          },
          json:true
        });
      };

      it('traverses all pages', (done) => {
        paging.readPage('/page1', token, perf, { paging: {} }, {
          processResourceFn: (resource, cb) => {
            cb();
          },
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %o and response %j', error, response)));
          },
          success: () => {
            const args = reqmock.get.args;
            expect(args.length).to.equal(2);
            checkRequest(args[0], '/page1');
            checkRequest(args[1], '/page2');

            done();
          }
        });
      });

      it('traverses all resources', (done) => {
        let resources = [];
        paging.readPage('/page1', token, perf, { paging: {} }, {
          processResourceFn: (resource, cb) => {
            resources.push(resource);
            cb();
          },
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %o and response %j', error, response)));
          },
          success: () => {
            expect(resources.length).to.equal(15);
            expect(resources).to.deep.equal(range(15));

            done();
          }
        });
      });
    });

    context('on empty page', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(null, { statusCode: 200, body: emptyPage });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        token = () => 'token';

        paging = require('../index.js');
      });

      it('traverses no resources', (done) => {
        let resources = [];
        paging.readPage('/emptyPage', token, perf, { paging: {} }, {
          processResourceFn: (resource, cb) => {
            resources.push(resource);
            cb();
          },
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %o and response %j', error, response)));
          },
          success: () => {
            expect(resources.length).to.equal(0);
            done();
          }
        });
      });
    });

    context('with empty response', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(null, { statusCode: 200, body: emptyResponse });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        token = () => 'token';

        paging = require('../index.js');
      });

      it('traverses no resources', (done) => {
        let resources = [];
        paging.readPage('/emptyBody', token, perf, { paging: {} }, {
          processResourceFn: (resource, cb) => {
            resources.push(resource);
            cb();
          },
          failure: (error, response) => {
            done(new Error(util.format('Unexpected call of failure with ' +
              'error %o and response %j', error, response)));
          },
          success: () => {
            expect(resources.length).to.equal(0);
            done();
          }
        });
      });
    });
  });

  context('on failure', () => {
    context('when no token exists', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(null, { statusCode: 200, body: pageTwo });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        token = () => undefined;

        paging = require('../index.js');
      });

      it('does not process any resources', (done) => {
        paging.readPage('/page1', token, perf, { paging: {} }, {
          processResourceFn: () => {
            done('no resources should be processed');
          },
          failure: (error, response) => {
            expect(error).to.equal('Missing CF token');
            expect(response).to.equal(undefined);

            const args = reqmock.get.args;
            expect(args.length).to.equal(0);

            done();
          },
          success: () => {
            done(new Error('Unexpected call of success'));
          }
        });
      });
    });

    context('when a page read errors', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb('error', null);
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        token = () => 'token';

        paging = require('../index.js');
      });

      it('does not process any resources', (done) => {
        paging.readPage('/page1', token, perf, { paging: {} }, {
          processResourceFn: () => {
            done('no resources should be processed');
          },
          failure: (error, response) => {
            expect(error).to.equal('error');
            expect(response).to.equal(null);

            const args = reqmock.get.args;
            expect(args.length).to.equal(1);

            done();
          },
          success: () => {
            done(new Error('Unexpected call of success'));
          }
        });
      });
    });

    context('when a page read returns bad response', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, perf, {
          get: spy((uri, opts, cb) => {
            cb(null, { statusCode: 500, body: null });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        token = () => 'token';

        paging = require('../index.js');
      });

      it('does not process any resources', (done) => {
        paging.readPage('/page1', token, perf, { paging: {} }, {
          processResourceFn: () => {
            done('no resources should be processed');
          },
          failure: (error, response) => {
            expect(error).to.equal(null);
            expect(response.statusCode).to.equal(500);

            const args = reqmock.get.args;
            expect(args.length).to.equal(1);

            done();
          },
          success: () => {
            done(new Error('Unexpected call of success'));
          }
        });
      });
    });

    context('when second page read errors', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            if (opts.page.indexOf('page2') > -1)
              cb(null, { statusCode: 500, body: pageTwo });
            else
              cb(null, { statusCode: 200, body: pageOne });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        token = () => 'token';

        paging = require('../index.js');
      });

      it('reads only first page resources', (done) => {
        let resources = [];
        paging.readPage('/page1', token, perf, { paging: {} }, {
          processResourceFn: (resource, error) => {
            resources.push(resource);
            error(null);
          },
          failure: (error, response) => {
            expect(response.statusCode).to.equal(500);
            const args = reqmock.get.args;
            expect(args.length).to.equal(2);

            expect(resources.length).to.equal(11);
            expect(resources).to.deep.equal(range(11));

            done();
          },
          success: () => {
            done(new Error('Unexpected call of success'));
          }
        });
      });
    });

    context('when a resource cannot be processed', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            if (opts.page.indexOf('page2') > -1)
              cb(null, { statusCode: 200, body: pageTwo });
            else
              cb(null, { statusCode: 200, body: pageOne });
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        token = () => 'token';

        paging = require('../index.js');
      });

      it('stops processing resources', (done) => {
        let resources = [];
        paging.readPage('/page1', token, perf, { paging: {} }, {
          processResourceFn: (resource, error) => {
            resources.push(resource);
            if (resources.length < 5)
              error(undefined);
            else
              error('too many resources');
          },
          failure: (error, response) => {
            expect(error).to.equal('too many resources');
            expect(response).to.equal(undefined);

            expect(resources.length).to.equal(5);
            expect(resources).to.deep.equal(range(5));

            done();
          },
          success: () => {
            done(new Error('Unexpected call of success'));
          }
        });
      });
    });
  });

});

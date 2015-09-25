'use strict';

const _ = require('underscore');
const extend = _.extend;
const range = _.range;

// Configure API URL
process.env.API = 'http://api';

describe('Paging', () => {
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

  afterEach(() => {
    // Delete cached modules exports
    delete require.cache[require.resolve('abacus-request')];
    delete require.cache[require.resolve('../paging.js')];
    delete require.cache[require.resolve('../oauth.js')];

    reqmock = undefined;
    paging = undefined;
  });

  context('on success', () => {
    context('on non-empty page', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            if (opts.page.indexOf('page2') > -1)
              cb(null, {statusCode: 200, body: pageTwo});
            else
              cb(null, {statusCode: 200, body: pageOne});
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Mock the oauth token
        require('../oauth.js');
        require.cache[require.resolve('../oauth.js')].exports.getToken =
          () => 'token';

        paging = require('../paging.js');
      });

      const checkRequest = (req, pageURI) => {
        expect(req[0]).to.equal(':api:page');
        expect(req[1]).to.eql({
          api:'http://api',
          page: pageURI,
          headers: {
            Authorization: 'token'
          },
          json:true
        });
      };

      it('traverses all pages', function(done) {
        paging.readPage('/page1', {
          processResourceFn: (resource, cb) => {
            cb();
          }
        });

        setTimeout(() => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(2);
          checkRequest(args[0], '/page1');
          checkRequest(args[1], '/page2');

          done();
        }, 200);
      });

      it('traverses all resources', function(done) {
        let resources = [];
        paging.readPage('/page1', {
          processResourceFn: (resource, cb) => {
            resources.push(resource);
            cb();
          }
        });

        setTimeout(() => {
          expect(resources.length).to.equal(15);
          expect(resources).to.eql(range(15));

          done();
        }, 200);
      });
    });

    context('on empty page', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(null, {statusCode: 200, body: emptyPage});
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Mock the oauth token
        require('../oauth.js');
        require.cache[require.resolve('../oauth.js')].exports.getToken =
          () => 'token';

        paging = require('../paging.js');
      });

      it('traverses no resources', function(done) {
        let resources = [];
        paging.readPage('/emptyPage', {
          processResourceFn: (resource, cb) => {
            resources.push(resource);
            cb();
          }
        });

        setTimeout(() => {
          expect(resources.length).to.equal(0);

          done();
        }, 200);
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
            cb(null, {statusCode: 200, body: pageTwo});
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Mock the oauth token
        require('../oauth.js');
        require.cache[require.resolve('../oauth.js')].exports.getToken =
          () => undefined;

        paging = require('../paging.js');
      });

      it('does not process any resources', function(done) {
        paging.readPage('/page1', {
          processResourceFn: () => {
            done('no resources should be processed');
          },
          onError: (error, response) => {
            expect(error).to.equal('Missing token');
            expect(response).to.equal(null);
          }
        });

        setTimeout(() => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(0);

          done();
        }, 200);
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

        // Mock the oauth token
        require('../oauth.js');
        require.cache[require.resolve('../oauth.js')].exports.getToken =
          () => 'token';

        paging = require('../paging.js');
      });

      it('does not process any resources', function(done) {
        paging.readPage('/page1', {
          processResourceFn: () => {
            done('no resources should be processed');
          },
          onError: (error, response) => {
            expect(error).to.equal('error');
            expect(response).to.equal(null);
          }
        });

        setTimeout(() => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(1);

          done();
        }, 200);
      });
    });

    context('when a page read returns bad response', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            cb(null, {statusCode: 500, body: null});
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Mock the oauth token
        require('../oauth.js');
        require.cache[require.resolve('../oauth.js')].exports.getToken =
          () => 'token';

        paging = require('../paging.js');
      });

      it('does not process any resources', function(done) {
        paging.readPage('/page1', {
          processResourceFn: () => {
            done('no resources should be processed');
          },
          onError: (error, response) => {
            expect(error).to.equal(null);
            expect(response.statusCode).to.equal(500);
          }
        });

        setTimeout(() => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(1);

          done();
        }, 200);
      });
    });

    context('when second page read errors', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            if (opts.page.indexOf('page2') > -1)
              cb(null, {statusCode: 500, body: pageTwo});
            else
              cb(null, {statusCode: 200, body: pageOne});
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Mock the oauth token
        require('../oauth.js');
        require.cache[require.resolve('../oauth.js')].exports.getToken =
          () => 'token';

        paging = require('../paging.js');
      });

      it('reads only first page resources', function(done) {
        let resources = [];
        paging.readPage('/page1', {
          processResourceFn: (resource, error) => {
            resources.push(resource);
            error(null);
          }
        });

        setTimeout(() => {
          const args = reqmock.get.args;
          expect(args.length).to.equal(2);

          expect(resources.length).to.equal(11);
          expect(resources).to.eql(range(11));

          done();
        }, 200);
      });
    });

    context('when a resource cannot be processed', () => {
      beforeEach(() => {
        // Mock the request module
        const request = require('abacus-request');
        reqmock = extend({}, request, {
          get: spy((uri, opts, cb) => {
            if (opts.page.indexOf('page2') > -1)
              cb(null, {statusCode: 200, body: pageTwo});
            else
              cb(null, {statusCode: 200, body: pageOne});
          })
        });
        require.cache[require.resolve('abacus-request')].exports = reqmock;

        // Mock the oauth token
        require('../oauth.js');
        require.cache[require.resolve('../oauth.js')].exports.getToken =
          () => 'token';

        paging = require('../paging.js');
      });

      it('stops processing resources', function(done) {
        let resources = [];
        paging.readPage('/page1', {
          processResourceFn: (resource, error) => {
            resources.push(resource);
            if (resources.length < 5)
              error(null);
            else
              error('too many resources');
          }
        });

        setTimeout(() => {
          expect(resources.length).to.equal(5);
          expect(resources).to.eql(range(5));

          done();
        }, 200);
      });
    });
  });

});

'use strict';
const session = require('express-session');
const couchStore = require('..')(session);
const dbclient = require('abacus-dbclient');
const moment = require('abacus-moment');
const server = () => process.env.DB;

describe('abacus-couchStore', () => {
  let store;
  let dbName = 'abacus-test-dashboard';
  let cookie = { name: 'test-cookie', cookie: { maxAge: 5000 } };

  before(() => {
    store = new couchStore({
      'dbUri': server(),
      'dbName': dbName,
      'type': 'connect-session'
    });
    store.unsetRemoveExpiredSession();
  });

  after((done) => {
    if(!/:/.test(server()))
      dbclient.drop(undefined, /^abacus-test-dashboard-0-0-mrview/, () => {
        dbclient.drop(undefined,/^abacus-test-dashboard/, done);
      });
    else
      dbclient.drop(server(),/^abacus-test-dashboard/, done);
  });

  it('upsert session cookie', (done) => {
    store.set('test-cookie', cookie, (err, doc) => {
      expect(err).to.be.equal(null);
      expect(doc.id).to.be.equal('test-cookie');
      // test upsert method
      store.set('test-cookie', cookie, (err, getdoc) => {
        expect(err).to.be.equal(null);
        done();
      });
    });
  });

  it('get session cookie', (done) => {
    store.get('test-cookie', (err, doc) => {
      expect(err).to.be.equal(null);
      expect(doc).to.deep.equal(
        { name: 'test-cookie', cookie: { maxAge: 5000 } });
      done();
    });
  });

  it('get session cookie failure', (done) => {
    store.get('test-cookie1', (err, doc) => {
      expect(err).to.be.equal(null);
      expect(doc).to.be.equal(undefined);
      done();
    });
  });

  it('destroy session cookie', (done) => {
    store.destroy('test-cookie', (err, resp) => {
      expect(err).to.be.equal(null);
      expect(resp.ok).to.be.equal(true);
      done();
    });
  });

  it('destroy session cookie failure', (done) => {
    store.destroy('test-cookie1', (err, resp) => {
      expect(err).to.be.equal(null);
      expect(resp).to.be.equal(undefined);
      done();
    });
  });

  it('touch session cookie without expire time', (done) => {
    let updateCookie = {
      name: 'test-cookie', cookie: {
        expires: null
      }
    };

    store.set('test-cookie', updateCookie, (err, resp) => {
      store.touch('test-cookie', updateCookie, (err, resp) => {
        store.get('test-cookie', (err, doc) => {
          expect(err).to.be.equal(null);
          expect(doc).to.deep.equal({
            name: 'test-cookie', cookie: {
              expires: null
            }
          });
          done();
        });

      });
    });
  });

  it('touch session cookie with expire time', (done) => {
    let updateCookie = {
      name: 'test-cookie', cookie: {
        expires: moment.utc(
          '2014-11-06 19:07:54')
      }
    };

    store.set('test-cookie', cookie, (err, resp) => {
      store.touch('test-cookie', updateCookie, (err, resp) => {
        store.get('test-cookie', (err, doc) => {
          expect(err).to.be.equal(null);
          expect(doc).to.deep.equal({
            name: 'test-cookie',
            cookie: { expires: '2014-11-06T19:07:54.000Z' }
          });
          done();
        });
      });
    });
  });

  it('remove expired session', (done) => {
    let updateCookie = {
      name: 'test-cookie', cookie: {
        expires: moment.utc(
          '2017-08-08 19:07:54')
      }
    };
    store.set('test-cookie-2', updateCookie, (err, setresp) => {
      expect(setresp.ok).to.be.equal(true);
      store.removeExpiredSession((err, resp) => {
        expect(err).to.be.equal(null);
        expect(resp[0].id).to.deep.equal('test-cookie');
        expect(resp[1].id).to.deep.equal('test-cookie-2');
        store.get('test-cookie-2', (err, getresp) => {
          expect(err).to.be.equal(null);
          expect(getresp).to.be.equal(undefined);
          done();
        });
      });
    });
  });
});

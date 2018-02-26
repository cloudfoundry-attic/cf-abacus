'use strict';
/* eslint-disable max-len*/
const index = require('./lib/index.js');
delete require.cache[require.resolve('..')];

index.mockDbSettings();
const themeCtrl = require('../controllers').themeCtrl;
const dbUtils = require('../db/MongoDbUtils');
const fs = require('fs');
const path = require('path');

describe('themeController', () => {
  let req = {};
  let cbfn;
  before(() => {
    index.deleteModules();
    cbfn = () => {

    };
    req.session = {};
    req.session.uaa_response = {
      parsed_token: [{}, {
        email: 'test'
      }]
    };
  });
  after(() => {});

  describe('saveThemePreference', () => {
    let controllerSpy, fetchRecordStub, upsertStub;
    beforeEach(function() {
      if (!process.env.DBCLIENT ||
        process.env.DBCLIENT === 'abacus-couchclient')
        this.skip();

      controllerSpy = sinon.spy(themeCtrl, 'saveThemePreference');
      fetchRecordStub = sinon.stub(dbUtils.prototype, 'fetchRecords', (col, opt, cb) => {
        return cb(null, [{
          'themePreference': 'test'
        }]);
      });
      upsertStub = sinon.stub(dbUtils.prototype, 'upsert', (col, par1, par2, cb) => {
        return cb(null, 'success');
      });
    });
    afterEach(() => {
      controllerSpy.restore();
      fetchRecordStub.restore();
      upsertStub.restore();
    });
    it('checks saveThemes and return a callback', () => {
      themeCtrl.saveThemePreference(req, cbfn);
      expect(controllerSpy.calledOnce).to.equal(true);
      expect(fetchRecordStub.callCount).to.equal(1);
    });
  });

  describe('getThemePreference', () => {
    let controllerSpy, fetchRecordStub;
    beforeEach(function() {
      if (!process.env.DBCLIENT ||
        process.env.DBCLIENT === 'abacus-couchclient')
        this.skip();

      controllerSpy = sinon.spy(themeCtrl, 'getThemePreference');
    });
    afterEach(() => {
      controllerSpy.restore();
    });
    describe('gets saved theme, but error thrown', () => {
      before(() => {
        fetchRecordStub = sinon.stub(dbUtils.prototype, 'fetchRecords', (col, opt, cb) => {
          return cb({
            'Error': 'Some Error'
          }, null);
        });
      });
      after(() => {
        fetchRecordStub.restore();
      });
      it('calls controller getThemePreference', () => {
        themeCtrl.getThemePreference(req, cbfn);
        expect(controllerSpy.calledOnce).to.equal(true);
        expect(fetchRecordStub.callCount).to.equal(1);
      });
    });
    describe('gets saved theme, but empty response', () => {
      before(() => {
        fetchRecordStub = sinon.stub(dbUtils.prototype, 'fetchRecords', (col, opt, cb) => {
          return cb(null, []);
        });
      });
      after(() => {
        fetchRecordStub.restore();
      });
      it('calls controller getThemePreference', () => {
        themeCtrl.getThemePreference(req, cbfn);
        expect(controllerSpy.calledOnce).to.equal(true);
        expect(fetchRecordStub.callCount).to.equal(1);
      });
    });
    describe('gets saved theme, with response othertype theme', () => {
      let anotherStub;
      before(() => {
        fetchRecordStub = sinon.stub(dbUtils.prototype, 'fetchRecords', (col, opt, cb) => {
          return cb(null, [{
            'displayname': 'test',
            'themeType': 'otherTheme',
            'themePreference': 'test.css'
          }]);
        });
        anotherStub = sinon.stub(themeCtrl, '_getThemeMapingJson', () => {
          return {
            'themes': [{
              'displayname': 'test',
              'filename': 'test.css',
              'themePreference': 'test.css'
            }]
          };
        });
      });
      after(() => {
        fetchRecordStub.restore();
        anotherStub.restore();
      });
      it('calls controller getThemePreference', () => {
        themeCtrl.getThemePreference(req, cbfn);
        expect(controllerSpy.calledOnce).to.equal(true);
        expect(fetchRecordStub.callCount).to.equal(1);
      });
    });
    describe('gets saved theme, with response customType theme', () => {
      let anotherStub;
      before(() => {
        fetchRecordStub = sinon.stub(dbUtils.prototype, 'fetchRecords', (col, opt, cb) => {
          return cb(null, [{
            'displayname': 'test',
            'themeType': 'custom',
            'themePreference': 'test.css'
          }]);
        });
        anotherStub = sinon.stub(themeCtrl, '_getThemeMapingJson', () => {
          return {
            'themes': [{
              'displayname': 'test',
              'filename': 'test.css',
              'themePreference': 'test.css'
            }]
          };
        });
      });
      after(() => {
        fetchRecordStub.restore();
        anotherStub.restore();
      });
      it('calls controller getThemePreference', () => {
        themeCtrl.getThemePreference(req, cbfn);
        expect(controllerSpy.calledOnce).to.equal(true);
        expect(fetchRecordStub.callCount).to.equal(1);
      });
    });
  });

  describe('_checkUserPref, response has custom themeType', () => {
    let controllerSpy, fetchRecordStub, dbUtilsStub;
    beforeEach(function() {
      if (!process.env.DBCLIENT ||
        process.env.DBCLIENT === 'abacus-couchclient')
        this.skip();
        
      controllerSpy = sinon.spy(themeCtrl, '_checkUserPref');
      fetchRecordStub = sinon.stub(dbUtils.prototype, 'fetchRecords', (col, opt, cb) => {
        return cb(null, [{
          'themePreference': 'test.css',
          'themeType': 'custom'
        }]);
      });
      dbUtilsStub = sinon.stub(dbUtils.prototype, 'getCSSFromDB', (id, cb) => {
        return cb(null, '');
      });
    });
    afterEach(() => {
      controllerSpy.restore();
      fetchRecordStub.restore();
      dbUtilsStub.restore();
    });
    it('checks saveThemes and return a callback', () => {
      themeCtrl._checkUserPref(req, cbfn);
      expect(controllerSpy.calledOnce).to.equal(true);
      expect(fetchRecordStub.callCount).to.equal(2);
    });
  });
  describe('_checkUserPref, response has otherType themeType', () => {
    let controllerSpy, fetchRecordStub, anotherStub, fsStub;
    beforeEach(function() {
      if (!process.env.DBCLIENT ||
        process.env.DBCLIENT === 'abacus-couchclient')
        this.skip();

      controllerSpy = sinon.spy(themeCtrl, '_checkUserPref');
      fetchRecordStub = sinon.stub(dbUtils.prototype, 'fetchRecords', (col, opt, cb) => {
        return cb(null, [{
          'themePreference': 'test.css',
          'themeType': 'otherTheme'
        }]);
      });
      anotherStub = sinon.stub(themeCtrl, '_getThemeMapingJson', () => {
        return {
          'baseDir': 'xyz/abc',
          'themes': [{
            'displayname': 'test',
            'filename': 'test.css',
            'themePreference': 'test.css'
          }]
        };
      });
      fsStub = sinon.stub(fs, 'readFileSync', () => {
        return 'some Data';
      });
    });
    afterEach(() => {
      controllerSpy.restore();
      fetchRecordStub.restore();
      anotherStub.restore();
      fsStub.restore();
    });
    it('checks saveThemes and return a callback', () => {
      themeCtrl._checkUserPref(req, cbfn);
      expect(controllerSpy.calledOnce).to.equal(true);
      expect(fetchRecordStub.callCount).to.equal(1);
    });
  });
  describe('_checkUserPref, response has otherType themeType', () => {
    let controllerSpy, fetchRecordStub;
    beforeEach(function() {
      if (!process.env.DBCLIENT ||
        process.env.DBCLIENT === 'abacus-couchclient')
        this.skip();
        
      controllerSpy = sinon.spy(themeCtrl, '_checkUserPref');
      fetchRecordStub = sinon.stub(dbUtils.prototype, 'fetchRecords', (col, opt, cb) => {
        return cb(null, []);
      });
    });
    afterEach(() => {
      controllerSpy.restore();
      fetchRecordStub.restore();
    });
    it('res is null', () => {
      themeCtrl._checkUserPref(req, cbfn);
      expect(controllerSpy.calledOnce).to.equal(true);
      expect(fetchRecordStub.callCount).to.equal(1);
    });
  });

  describe('getDefaultThemeFile', () => {
    let controllerSpy, checkUserPrefStb;
    beforeEach(() => {
      controllerSpy = sinon.spy(themeCtrl, 'getDefaultThemeFile');
    });
    afterEach(() => {
      controllerSpy.restore();
    });
    describe('_checkUserPref returns not null', () => {
      before(() => {
        checkUserPrefStb = sinon.stub(themeCtrl, '_checkUserPref', (req, cb) => {
          return cb('success');
        });
      });
      after(() => {
        checkUserPrefStb.restore();
      });
      it('res is not null', () => {
        themeCtrl.getDefaultThemeFile(req, cbfn);
        expect(controllerSpy.calledOnce).to.equal(true);
        expect(checkUserPrefStb.callCount).to.equal(1);
      });
    });
    describe('_checkUserPref returns null', () => {
      before(() => {
        checkUserPrefStb = sinon.stub(themeCtrl, '_checkUserPref', (req, cb) => {
          return cb(null);
        });
      });
      after(() => {
        checkUserPrefStb.restore();
      });
      it('process.env.PRE_PROVIDED_DEFAULT_THEME_NAME is not set', () => {
        themeCtrl.getDefaultThemeFile(req, cbfn);
        expect(controllerSpy.calledOnce).to.equal(true);
        expect(checkUserPrefStb.callCount).to.equal(1);
      });
    });
    describe('_checkUserPref returns null', () => {
      let _getThemeMapingJsonStb, _getThemeSrcFromMappingStb;
      before(() => {
        process.env.PRE_PROVIDED_DEFAULT_THEME_NAME = 'test';
        checkUserPrefStb = sinon.stub(themeCtrl, '_checkUserPref', (req, cb) => {
          return cb(null);
        });
        _getThemeMapingJsonStb = sinon.stub(themeCtrl, '_getThemeMapingJson', () => {
          return {};
        });
        _getThemeSrcFromMappingStb = sinon.stub(themeCtrl, '_getThemeSrcFromMapping', () => {
          let readSrc = path
            .join(__dirname + '/fixtures/testCssFile.css');
          return readSrc;
        });
      });
      after(() => {
        process.env.PRE_PROVIDED_DEFAULT_THEME_NAME = '';
        checkUserPrefStb.restore();
        _getThemeMapingJsonStb.restore();
        _getThemeSrcFromMappingStb.restore();
      });
      it('process.env.PRE_PROVIDED_DEFAULT_THEME_NAME is set', () => {

        themeCtrl.getDefaultThemeFile(req, cbfn);
        expect(controllerSpy.calledOnce).to.equal(true);
        expect(checkUserPrefStb.callCount).to.equal(1);
      });
    });
  });

  describe('fetchPreUploadedFileNames', () => {
    let _getThemeMapingJsonStb, controllerSpy;
    before(() => {
      process.env.PRE_PROVIDED_DEFAULT_THEME_NAME = 'test';
      controllerSpy = sinon.spy(themeCtrl, 'fetchPreUploadedFileNames');
      _getThemeMapingJsonStb = sinon.stub(themeCtrl, '_getThemeMapingJson', () => {
        return {
          'baseDir': 'xyz/abc',
          'themes': [{
            'displayname': 'test',
            'filename': 'test.css',
            'themePreference': 'test.css'
          }, {
            'displayname': 'test1',
            'filename': 'test1.css',
            'themePreference': 'test1.css'
          }]
        };
      });
    });
    after(() => {
      process.env.PRE_PROVIDED_DEFAULT_THEME_NAME = '';
      _getThemeMapingJsonStb.restore();
      controllerSpy.restore();
    });
    it('process.env.PRE_PROVIDED_DEFAULT_THEME_NAME is set', () => {
      themeCtrl.fetchPreUploadedFileNames();
      expect(controllerSpy.calledOnce).to.equal(true);
    });
  });

  describe('_getThemeMapingJson', () => {
    let controllerSpy;
    before(() => {
      controllerSpy = sinon.spy(themeCtrl, '_getThemeMapingJson');
    });
    after(() => {
      controllerSpy.restore();
    });
    it('calls the methoda returns an array', () => {
      themeCtrl._getThemeMapingJson();
      expect(controllerSpy.calledOnce).to.equal(true);
    });
  });

  describe('_getThemeSrcFromMapping', () => {
    let controllerSpy, mapping;
    before(() => {
      controllerSpy = sinon.spy(themeCtrl, '_getThemeSrcFromMapping');
      mapping = {
        'baseDir': 'xyz/abc',
        'themes': [{
          'displayname': 'test',
          'filename': '',
          'themePreference': 'test.css'
        }]
      };
    });
    after(() => {
      controllerSpy.restore();
    });
    it('calls the methoda returns an array', () => {
      themeCtrl._getThemeSrcFromMapping(mapping,'test');
      expect(controllerSpy.calledOnce).to.equal(true);
    });
  });

});

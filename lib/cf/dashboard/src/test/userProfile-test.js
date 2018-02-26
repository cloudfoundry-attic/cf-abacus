'use strict';
/* eslint-disable max-len*/
const index = require('./lib/index.js');
const themeCtrl = require('../controllers').themeCtrl;
const dbUtils = require('../db/MongoDbUtils');
describe('userProfile Routes', () => {
  let app = null;
  before(() => {
    index.deleteAuthMiddlewareCache();
    index.mockAuthMiddleware();
    index.mockDbSettings();
    app = require('../application')();
  });
  after(() => {
    index.deleteModules();
    index.deleteAuthMiddlewareCache();
  });

  describe('/getUser route', () => {
    it('suould return email of the user logged in', (done) => {
      chai
        .request(app)
        .get('/userProfile/getUser')
        .send({})
        .catch((err) => err.response)
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(res.type).to.equal('application/json');
          done();
        });
    });
  });

  describe('/getThemeUploadFeatureFlag route', () => {
    it('suould return ENV for theme enablement of the user logged in', (done) => {
      chai
        .request(app)
        .get('/userProfile/getThemeUploadFeatureFlag')
        .send({})
        .catch((err) => err.response)
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          done();
        });
    });
  });

  describe('/cssupoad route with success', () => {
    let uploadFormDBStb, controllerSpy;
    let path = require('path');
    const themeCtrl = require('../controllers').themeCtrl;
    let filepath = path.join(__dirname, './fixtures/testCssFile.css');
    beforeEach(function() {
      if (!process.env.DBCLIENT ||
        process.env.DBCLIENT === 'abacus-couchclient')
        this.skip();

      uploadFormDBStb = sinon.stub(dbUtils.prototype, 'saveCSSToDB', (path, name, opt, cb) => {
        return cb(null, 'saved');
      });
      controllerSpy = sinon.spy(themeCtrl, 'processIncommingForm');
    });
    afterEach(() => {
      uploadFormDBStb.restore();
      controllerSpy.restore();
    });
    it('call cssupload route to upload to DB', (done) => {
      chai
        .request(app)
        .post('/userProfile/cssUpload')
        .field('Content-Type', 'multipart/form-data')
        .field('name', 'cssFile')
        .attach('file', filepath)
        .catch((err) => err.response)
        .then((res) => {
          expect(controllerSpy.threw()).to.equal(false);
          expect(res.statusCode).to.equal(200);
          expect(uploadFormDBStb.callCount).to.equal(1);
          done();
        });
    });
  });

  describe('/cssupoad route with error', () => {
    let uploadFormStb;
    before(() => {
      uploadFormStb = sinon.stub(themeCtrl, 'processIncommingForm');
    });
    after(() => {
      uploadFormStb.restore();
    });
    describe('with error code', () => {
      before(() => {
        uploadFormStb.throws({
          'status': 400,
          'message': 'Bad Request'
        });
      });
      it('call cssupload route to upload to DB', (done) => {
        chai
          .request(app)
          .post('/userProfile/cssUpload')
          .send({})
          .catch((err) => err.response)
          .then((res) => {
            expect(res.statusCode).to.equal(400);
            expect(uploadFormStb.callCount).to.equal(1);
            done();
          });
      });
    });
    describe('without error code', () => {
      before(() => {
        uploadFormStb.throws();
      });
      after(() => {
        uploadFormStb.restore();
      });
      it('call cssupload route to upload to DB', (done) => {
        chai
          .request(app)
          .post('/userProfile/cssUpload')
          .send({})
          .catch((err) => err.response)
          .then((res) => {
            expect(res.statusCode).to.equal(500);
            expect(uploadFormStb.callCount).to.equal(2);
            done();
          });
      });
    });
  });

  describe('/getThemeMetadata route with success', () => {
    let fetchRecordsStb, fetchPreUploadedFileNamesStb;
    beforeEach(function() {
      if (!process.env.DBCLIENT ||
        process.env.DBCLIENT === 'abacus-couchclient')
        this.skip();

      fetchPreUploadedFileNamesStb = sinon.stub(themeCtrl, 'fetchPreUploadedFileNames').returns([1]);
      fetchRecordsStb = sinon.stub(dbUtils.prototype, 'fetchRecords', (coll, opt, cb) => {
        return cb(null, [2]);
      });
    });
    afterEach(() => {
      fetchRecordsStb.restore();
      fetchPreUploadedFileNamesStb.restore();
    });
    it('call getThemeMetadata to get all saved themes', (done) => {
      chai
        .request(app)
        .get('/userProfile/getThemeMetadata')
        .send({})
        .catch((err) => err.response)
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(fetchPreUploadedFileNamesStb.callCount).to.equal(1);
          expect(fetchRecordsStb.callCount).to.equal(1);
          expect(res.body.length).to.equal(2);
          done();
        });
    });
  });

  describe('/saveThemePreference route with success', () => {
    let saveThemePreferenceStb;
    before(() => {
      saveThemePreferenceStb = sinon.stub(themeCtrl, 'saveThemePreference', (req, cb) => {
        return cb(true);
      });
    });
    after(() => {
      saveThemePreferenceStb.restore();
    });
    it('call saveThemePreference to save selected themes', (done) => {
      chai
        .request(app)
        .put('/userProfile/saveThemePreference')
        .send({})
        .catch((err) => err.response)
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(saveThemePreferenceStb.callCount).to.equal(1);
          done();
        });
    });
  });

  describe('/getThemePreference route with success', () => {
    let getThemePreferenceStb;
    before(() => {
      getThemePreferenceStb = sinon.stub(themeCtrl, 'getThemePreference', (req, cb) => {
        return cb(null, true);
      });
    });
    after(() => {
      getThemePreferenceStb.restore();
    });
    it('call getThemePreference to save selected themes', (done) => {
      chai
        .request(app)
        .get('/userProfile/getThemePreference')
        .send({})
        .catch((err) => err.response)
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(getThemePreferenceStb.callCount).to.equal(1);
          done();
        });
    });
  });

  describe('/getThemePreference route with error with known statuscode', () => {
    let getThemePreferenceStb;
    before(() => {
      getThemePreferenceStb = sinon.stub(themeCtrl, 'getThemePreference', (req, cb) => {
        return cb({
          'status': 400,
          'message': 'Some Error'
        }, null);
      });
    });
    after(() => {
      getThemePreferenceStb.restore();
    });
    it('call getThemePreference to save selected themes', (done) => {
      chai
        .request(app)
        .get('/userProfile/getThemePreference')
        .send({})
        .catch((err) => err.response)
        .then((res) => {
          expect(res.statusCode).to.equal(400);
          expect(getThemePreferenceStb.callCount).to.equal(1);
          done();
        });
    });
  });

  describe('/getThemePreference route with error with unknown statuscode', () => {
    let getThemePreferenceStb;
    before(() => {
      getThemePreferenceStb = sinon.stub(themeCtrl, 'getThemePreference', (req, cb) => {
        return cb({
          'message': 'Some Error'
        }, null);
      });
    });
    after(() => {
      getThemePreferenceStb.restore();
    });
    it('call getThemePreference to save selected themes', (done) => {
      chai
        .request(app)
        .get('/userProfile/getThemePreference')
        .send({})
        .catch((err) => err.response)
        .then((res) => {
          expect(res.statusCode).to.equal(500);
          expect(getThemePreferenceStb.callCount).to.equal(1);
          done();
        });
    });
  });

  describe('/getDefaultThemeFile route', () => {
    let getDefaultThemeFileStb;
    before(() => {
      getDefaultThemeFileStb = sinon.stub(themeCtrl, 'getDefaultThemeFile', (req, cb) => {
        return cb(true);
      });
    });
    after(() => {
      getDefaultThemeFileStb.restore();
    });
    it('call getDefaultThemeFile to get default theme', (done) => {
      chai
        .request(app)
        .get('/userProfile/getDefaultThemeFile')
        .send({})
        .catch((err) => err.response)
        .then((res) => {
          expect(getDefaultThemeFileStb.callCount).to.equal(1);
          done();
        });
    });
  });

  describe('/removePrefAndLoadPreDefTheme route', () => {
    let removeRecordsDBStb;
    beforeEach(function() {
      if (!process.env.DBCLIENT ||
        process.env.DBCLIENT === 'abacus-couchclient')
        this.skip();

      removeRecordsDBStb = sinon.stub(dbUtils.prototype, 'removeRecords', (col, opt, cb) => {
        return cb(null, 'saved');
      });
    });
    afterEach(() => {
      removeRecordsDBStb.restore();
    });
    it('call removePrefAndLoadPreDefTheme to remove default theme', (done) => {
      chai
        .request(app)
        .delete('/userProfile/removePrefAndLoadPreDefTheme')
        .send({})
        .catch((err) => err.response)
        .then((res) => {
          expect(res.statusCode).to.equal(200);
          expect(removeRecordsDBStb.callCount).to.equal(1);
          done();
        });
    });
  });
});

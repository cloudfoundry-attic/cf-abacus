'use strict';

/* eslint-disable max-len */

const express = require('express');
const router = express.Router();
const authenticator = require('../middleware/authMiddleware');
const CommonDbUtils = require('../db/CommonDbUtils');
const dbUtils = new CommonDbUtils().getDbTypeInstance();
const themeCtrl = require('../controllers').themeCtrl;
const _ = require('lodash');

router.get('/getUser',
  authenticator.ensureAuthenticated, (req, res) => {
    res.status(200).send({
      'email': req.session.uaa_response.parsed_token[1].email
    });
  });

router.post('/cssUpload',
  authenticator.ensureAuthenticated, (req, res) => {
    try {
      themeCtrl.processIncommingForm(req,function(err,data) {
        if(err) res.status(500).send('File save method is not available for CouchDb');
        else res.status(200).send(data);
      });
    } catch (error) {
      if(error.status)
        res.status(error.status).send(error.message);
      else
        res.status(500).send({ 'message' : 'Some Error during file save' });
    }
  });

router.get('/getThemeMetadata',
  authenticator.ensureAuthenticated, (req, res) => {
    let options = {
      'metadata': {
        'email': req.session.uaa_response.parsed_token[1].email
      }
    };
    dbUtils.fetchRecords('fs.files', options, (err, result) => {
      let list = themeCtrl.fetchPreUploadedFileNames();
      let modResult = _.isUndefined(result) ? [] : result;
      res.send(list.concat(modResult));
    });
  });

router.put('/saveThemePreference',
  authenticator.ensureAuthenticated, (req, res) => {
    themeCtrl.saveThemePreference(req,function(result) {
      res.send(result);
    });
  });

router.get('/getThemePreference',
  authenticator.ensureAuthenticated, (req, res) => {
    themeCtrl.getThemePreference(req,function(err,result) {
      if(err && err.status) 
        res.status(err.status).send(err.message);
      else if(err)
        res.status(500).send({ 'message' : 'Some Error during theme preference fetch' });
      res.send(result);
    });
  });

router.get('/getDefaultThemeFile',
  authenticator.ensureAuthenticated, (req, res) => {
    themeCtrl.getDefaultThemeFile(req,function(result) {
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.write(result);
      res.end();
    });
  });

router.delete('/removePrefAndLoadPreDefTheme',
  authenticator.ensureAuthenticated, (req, res) => {
    themeCtrl.removePrefAndLoadPreDefTheme(req,function(result) {
      res.send(result);
    });
  });

router.get('/getThemeUploadFeatureFlag',
  authenticator.ensureAuthenticated, (req, res) => {
    res.status(200).send(process.env.ENABLE_UPLOAD_THEME_FEATURE);
  });

module.exports = router;

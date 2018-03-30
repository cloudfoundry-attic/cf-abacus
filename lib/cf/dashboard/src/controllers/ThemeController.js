'use strict';

/* eslint-disable max-len*/
const logger = require('../utils/dashboardLogger');
const formidable = require('formidable');
const ThemeValidator = require('../utils/ThemeValidator');
const errors = require('../utils/errors');
const fs = require('fs');
const path = require('path');
const _ = require('lodash');
const CommonDbUtils = require('../db/CommonDbUtils');

const ParseError = errors.ParseError;
const dbUtils = new CommonDbUtils().getDbTypeInstance();
const isUndefined = _.isUndefined;
const isEmpty = _.isEmpty;

class ThemeController {
  constructor() {}

  processIncommingForm(req, cb) {
    let form = new formidable.IncomingForm();
    form.keepExtensions = true;
    form.parse(req, function(err, fields, files) {
      if (err) throw err;
      let message = new ThemeValidator().validateCSS(files.file.path, files.file.name);
      if (!isUndefined(message)) throw new ParseError(message);
      let options = {
        'metadata': {
          'email': req.session.uaa_response.parsed_token[1].email
        }
      };
      dbUtils.saveCSSToDB(files.file.path, files.file.name, options, function(error, success) {
        return cb(error, success);
      });
    });
  }

  saveThemePreference(req, cb) {
    let userPrefobj = req.body;
    let options = {
      'email': req.session.uaa_response.parsed_token[1].email
    };
    userPrefobj = _.assign(userPrefobj, options);
    let oldTheme = '';
    dbUtils.fetchRecords('userPref', options, function(err, result) {
      oldTheme = !_.isEmpty(result) ? _.first(result).themePreference : '';
      let query = {
        'themePreference': oldTheme
      };
      query = _.assign(query, options);
      dbUtils.upsert('userPref', query, userPrefobj, function(err, result) {
        if (err) throw err;
        logger.info('1 record inserted/updated in userPref');
        return cb(result);
      });
    });
  }

  getThemePreference(req,cb) {
    let options = {
      'email' : req.session.uaa_response.parsed_token[1].email
    };
    dbUtils.fetchRecords('userPref' ,options, (err,result) => {
      if(err) return cb(err,null);
      if(isEmpty(result)) return cb(null,process.env.PRE_PROVIDED_DEFAULT_THEME_NAME);
      let resData = _.first(result);
      if(resData.themeType === 'otherTheme') {
        let themeArr = this._getThemeMapingJson().themes;
        let resDisplayName = _.first(_.filter(themeArr,(d) => {
          return d.filename === resData.themePreference;
        })).displayname;
        return cb(null,resDisplayName);
      }
      return cb(null,_.first(result).themePreference.split('.css')[0]);
    });
  }

  /* eslint-disable consistent-return*/
  _checkUserPref(req,cb) {
    let options = {
      'email': req.session.uaa_response.parsed_token[1].email
    };
    dbUtils.fetchRecords('userPref', options, (err, result) => {
      let tempObj = _.first(result);
      if (!_.isEmpty(result) && tempObj.themeType !== 'otherTheme') {
        let opt = {
          'filename': tempObj.themePreference,
          'metadata': {
            'email': req.session.uaa_response.parsed_token[1].email
          }
        };
        dbUtils.fetchRecords('fs.files', opt, (err, result) => {
          let id = _.first(result)._id;
          dbUtils.getCSSFromDB(id, (err, result) => {
            return cb(result.data);
          });
        });
      }else if (!_.isEmpty(result) && tempObj.themeType === 'otherTheme') {
        let mapping = this._getThemeMapingJson();
        let displayname = _.first(_.filter(mapping.themes,(d) => {
          return d.filename === tempObj.themePreference;
        })).displayname;
        let readSrc = this._getThemeSrcFromMapping(mapping,displayname);
        let data = fs.readFileSync(readSrc, 'utf-8');
        return cb(data);
      }else return cb(null);
    });
  }
  /* eslint-enable consistent-return*/

  getDefaultThemeFile(req,cb) {
    this._checkUserPref(req,(data) => {
      if(data)
        return cb(data);

      let defaultThemeName = process.env.PRE_PROVIDED_DEFAULT_THEME_NAME;
      let readSrc;
      if (defaultThemeName) {
        let mapping = this._getThemeMapingJson();
        readSrc = this._getThemeSrcFromMapping(mapping,defaultThemeName);
      }
      if(!defaultThemeName || !readSrc) {
        readSrc = path
          .join(__dirname + '/../webapp/dist/css/defaultTheme.css');
        let data = fs.readFileSync(readSrc, 'utf-8');
        return cb(data);
      }
      let message = new ThemeValidator().validateCSS(readSrc,defaultThemeName);
      if(isUndefined(message)) {
        let data = fs.readFileSync(readSrc, 'utf-8');
        return cb(data);
      }
      throw new ParseError(message);
    });
  }

  fetchPreUploadedFileNames() {
    let themeArr = this._getThemeMapingJson().themes;
    for(let i = 0; i < themeArr.length; i++)
      if(themeArr[i].displayname === process.env.PRE_PROVIDED_DEFAULT_THEME_NAME)
        themeArr[i].themeType = 'defaultTheme';
      else
        themeArr[i].themeType = 'otherTheme';

    return themeArr;
  }

  removePrefAndLoadPreDefTheme(req,cb) {
    let options = {
      'email': req.session.uaa_response.parsed_token[1].email
    };
    dbUtils.removeRecords('userPref', options, function(err, result) {
      if(err) throw err;
      logger.info('record removed from userPref Collection');
      return cb(result);
    });
  }

  _getThemeMapingJson() {
    let themeMappingJsonPath = path
      .join(__dirname + '/../webapp/resources/customTheme/themeMapping.json');
    let mapping = require(themeMappingJsonPath);
    return mapping;
  }

  _getThemeSrcFromMapping(mapping,displayname) {
    let fileObj = _.first(_.filter(mapping.themes,(obj) =>{
      return obj.displayname === displayname;
    }));
    if(fileObj && fileObj.filename) {
      let filename = fileObj.filename;
      let readSrc = path
        .join(`${__dirname}/../${mapping.baseDir}/${fileObj.subdir}/${filename}`);
      return readSrc;
    }
    logger.debug('ThemeController :: manifest theme name mismatch');
    return null;
  }
}

module.exports = ThemeController;

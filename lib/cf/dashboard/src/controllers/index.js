'use strict';

const CfAbacusController = require('./CfAbacusController');
const CfApiController = require('./CfApiController');
const ThemeController = require('./ThemeController');

exports.CfAbacusController = CfAbacusController;
exports.CfApiController = CfApiController;
exports.ThemeController = ThemeController;

exports.cfAbacusApi = new CfAbacusController();
exports.cfApi = new CfApiController();
exports.themeCtrl = new ThemeController();

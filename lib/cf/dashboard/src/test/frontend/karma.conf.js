/* eslint-disable max-len*/
module.exports = function(config) {
  config.set({

    // base path that will be used to resolve all patterns (eg. files, exclude)
    basePath: '',

    // frameworks to use
    // available frameworks: https://npmjs.org/browse/keyword/karma-adapter
    frameworks: ['jasmine'],

    // list of files to exclude
    files: [
      '../../webapp/node_modules/karma-read-json/karma-read-json.js',
      '../../webapp/node_modules/jquery/dist/jquery.js',
      '../../webapp/node_modules/lodash/lodash.min.js',
      '../../webapp/node_modules/angular/angular.js',
      '../../webapp/node_modules/angular-sanitize/angular-sanitize.js',
      '../../webapp/node_modules/angular-ui-router/release/angular-ui-router.min.js',
      '../../webapp/node_modules/angular-breadcrumb/release/angular-breadcrumb.min.js',
      '../../webapp/node_modules/bootstrap/dist/js/bootstrap.js',
      '../../webapp/node_modules/angular-ui-bootstrap/dist/ui-bootstrap.js',
      '../../webapp/node_modules/angular-ui-bootstrap/dist/ui-bootstrap-tpls.js',
      '../../webapp/node_modules/angular-animate/angular-animate.js',
      '../../webapp/node_modules/angular-mocks/angular-mocks.js',
      '../../webapp/node_modules/ace-builds/src-min-noconflict/ace.js',
      '../../webapp/node_modules/angular-ui-ace/src/ui-ace.js',
      '../../webapp/node_modules/ace-builds/src-min-noconflict/ext-language_tools.js',
      '../../webapp/node_modules/clipboard/dist/clipboard.min.js',
      '../../webapp/node_modules/ngclipboard/dist/ngclipboard.min.js',
      '../../webapp/node_modules/angular-translate/dist/angular-translate.min.js',
      '../../webapp/node_modules/angular-translate-loader-partial/angular-translate-loader-partial.min.js',
      '../../webapp/components/home/HomeViewModule.js',
      '../../webapp/components/services/ResourceProviderService.js',
      '../../webapp/components/services/MessageBoxService.js',
      '../../webapp/components/metering/MeteringViewModule.js',
      '../../webapp/components/metrics/MetricsViewModule.js',
      '../../webapp/components/factories/httpInterceptor.js',
      '../../webapp/components/userProfile/userProfile.module.js',
      '../../webapp/components/userProfile/controllers/theme.controller.js',
      '../../webapp/components/userProfile/controllers/themeModal.controller.js',
      '../../webapp/components/userProfile/services/theme.service.js',
      '../../webapp/components/userProfile/services/userProfile.service.js',
      '../../webapp/components/userProfile/controllers/userProfile.controller.js',
      '../../webapp/components/factories/translationFactory.js',
      '../../webapp/app.routes.js',
      '../../webapp/app.module.js',
      'specs/*.js', {
        pattern: 'mock/**/*.json',
        included: false
      }

    ],
    exclude: [

    ],

    // preprocess matching files before serving them to the browser
    // available preprocessors: https://npmjs.org/browse/keyword/karma-preprocessor
    preprocessors: {
      '../../webapp/components/**/*.js': ['coverage']
    },


    // test results reporter to use
    // possible values: 'dots', 'progress'
    // available reporters: https://npmjs.org/browse/keyword/karma-reporter
    reporters: ['progress', 'coverage'],

    coverageReporter: {
      reporters: [
        { type: 'json', file: 'coverage.json' },
        { type: 'lcovonly', file: 'lcov.info' }
      ],
      dir: 'coverage/',
      subdir: '.'
    },

    // web server port
    port: 9876,

    // enable / disable colors in the output (reporters and logs)
    colors: true,

    // level of logging
    // possible values: config.LOG_DISABLE || config.LOG_ERROR || config.LOG_WARN || config.LOG_INFO || config.LOG_DEBUG
    logLevel: config.LOG_INFO,

    // enable / disable watching file and executing tests whenever any file changes
    autoWatch: false,

    // start these browsers
    // available browser launchers: https://npmjs.org/browse/keyword/karma-launcher
    browsers: ['PhantomJS'],

    // Continuous Integration mode
    // if true, Karma captures browsers, runs the tests and exits
    singleRun: true
  });
};

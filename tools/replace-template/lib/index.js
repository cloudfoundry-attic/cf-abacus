'use strict';

// Replace manifest.yml template using credentials file or environment variables

var commander = require('commander');
var fs = require('fs');
var glob = require('glob');
var path = require('path');
var yaml = require('js-yaml');

var credentialsFile = void 0;
var abacusConfigDir = void 0;

var parseCommandLineArgs = function parseCommandLineArgs(args) {
  commander.arguments('<abacus-config-directory> [credentials-file]').action(function (configDir, credentials) {
    abacusConfigDir = configDir;
    credentialsFile = credentials;
  }).parse(args);
};

var replaceEnvironmentValues = function replaceEnvironmentValues(environment, credentials, credentialsKey) {
  if (!environment) return;

  for (var appEnvKey in environment) {
    if (environment.hasOwnProperty(appEnvKey)) {
      var appEnvValue = environment[appEnvKey];
      if (typeof appEnvValue === 'string') environment[appEnvKey] = appEnvValue.replace(credentialsKey, credentials[credentialsKey]);
    }
  }
};

var replaceFiles = function replaceFiles(credentials, files) {
  console.log('Substituting in:');
  var _iteratorNormalCompletion = true;
  var _didIteratorError = false;
  var _iteratorError = undefined;

  try {
    var _loop = function _loop() {
      var templateFile = _step.value;

      fs.readFile(templateFile, 'utf8', function (err, content) {
        if (err) throw err;

        var templateYml = yaml.load(content);

        for (var credentialsKey in credentials) {
          var _iteratorNormalCompletion2 = true;
          var _didIteratorError2 = false;
          var _iteratorError2 = undefined;

          try {
            for (var _iterator2 = templateYml.applications[Symbol.iterator](), _step2; !(_iteratorNormalCompletion2 = (_step2 = _iterator2.next()).done); _iteratorNormalCompletion2 = true) {
              var application = _step2.value;

              replaceEnvironmentValues(application.env, credentials, credentialsKey);
            }
          } catch (err) {
            _didIteratorError2 = true;
            _iteratorError2 = err;
          } finally {
            try {
              if (!_iteratorNormalCompletion2 && _iterator2.return) {
                _iterator2.return();
              }
            } finally {
              if (_didIteratorError2) {
                throw _iteratorError2;
              }
            }
          }
        }var templatePath = path.dirname(templateFile);
        var templateBaseName = path.basename(templateFile);
        var manifestBaseName = templateBaseName.replace(/\.template/g, '');
        var manifestFile = path.join(templatePath, manifestBaseName);

        var manifestContent = yaml.dump(templateYml);
        fs.writeFile(manifestFile, manifestContent, 'utf8', function (err) {
          if (err) throw err;
        });
        console.log('   %s', manifestFile);
      });
    };

    for (var _iterator = files[Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
      _loop();
    }
  } catch (err) {
    _didIteratorError = true;
    _iteratorError = err;
  } finally {
    try {
      if (!_iteratorNormalCompletion && _iterator.return) {
        _iterator.return();
      }
    } finally {
      if (_didIteratorError) {
        throw _iteratorError;
      }
    }
  }
};

var runCLI = function runCLI() {
  parseCommandLineArgs(process.argv);

  if (typeof abacusConfigDir === 'undefined') {
    console.error('No abacus-config directory specified!');
    process.exit(1);
  }
  if (!fs.statSync(abacusConfigDir).isDirectory()) {
    console.error('Invalid abacus-config directory %s specified!', abacusConfigDir);
    process.exit(1);
  }
  console.log('Abacus config: %s', abacusConfigDir);

  var credentials = [];
  if (credentialsFile) {
    console.log('Using credentials file: %s', credentialsFile);
    fs.readFile(credentialsFile, 'utf8', function (err, content) {
      if (err) throw err;

      var credentialsYml = yaml.load(content);
      for (var key in credentialsYml) {
        if (credentialsYml.hasOwnProperty(key)) {
          var envVariableName = '$' + key.toUpperCase().replace(/-/g, '_');
          credentials[envVariableName] = credentialsYml[key];
        }
      }
    });
  } else {
    console.log('Using environment variables');
    for (var key in process.env) {
      if (process.env.hasOwnProperty(key)) {
        var envVariableName = '$' + key;
        credentials[envVariableName] = process.env[key];
      }
    }
  }

  glob(abacusConfigDir + '/lib/**/manifest.yml.template', function (err, files) {
    if (err) throw err;
    replaceFiles(credentials, files);
  });
};

// Export our CLI
module.exports.runCLI = runCLI;
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9pbmRleC5qcyJdLCJuYW1lcyI6WyJjb21tYW5kZXIiLCJyZXF1aXJlIiwiZnMiLCJnbG9iIiwicGF0aCIsInlhbWwiLCJjcmVkZW50aWFsc0ZpbGUiLCJhYmFjdXNDb25maWdEaXIiLCJwYXJzZUNvbW1hbmRMaW5lQXJncyIsImFyZ3MiLCJhcmd1bWVudHMiLCJhY3Rpb24iLCJjb25maWdEaXIiLCJjcmVkZW50aWFscyIsInBhcnNlIiwicmVwbGFjZUVudmlyb25tZW50VmFsdWVzIiwiZW52aXJvbm1lbnQiLCJjcmVkZW50aWFsc0tleSIsImFwcEVudktleSIsImhhc093blByb3BlcnR5IiwiYXBwRW52VmFsdWUiLCJyZXBsYWNlIiwicmVwbGFjZUZpbGVzIiwiZmlsZXMiLCJjb25zb2xlIiwibG9nIiwidGVtcGxhdGVGaWxlIiwicmVhZEZpbGUiLCJlcnIiLCJjb250ZW50IiwidGVtcGxhdGVZbWwiLCJsb2FkIiwiYXBwbGljYXRpb25zIiwiYXBwbGljYXRpb24iLCJlbnYiLCJ0ZW1wbGF0ZVBhdGgiLCJkaXJuYW1lIiwidGVtcGxhdGVCYXNlTmFtZSIsImJhc2VuYW1lIiwibWFuaWZlc3RCYXNlTmFtZSIsIm1hbmlmZXN0RmlsZSIsImpvaW4iLCJtYW5pZmVzdENvbnRlbnQiLCJkdW1wIiwid3JpdGVGaWxlIiwicnVuQ0xJIiwicHJvY2VzcyIsImFyZ3YiLCJlcnJvciIsImV4aXQiLCJzdGF0U3luYyIsImlzRGlyZWN0b3J5IiwiY3JlZGVudGlhbHNZbWwiLCJrZXkiLCJlbnZWYXJpYWJsZU5hbWUiLCJ0b1VwcGVyQ2FzZSIsIm1vZHVsZSIsImV4cG9ydHMiXSwibWFwcGluZ3MiOiJBQUFBOztBQUVBOztBQUVBLElBQU1BLFlBQVlDLFFBQVEsV0FBUixDQUFsQjtBQUNBLElBQU1DLEtBQUtELFFBQVEsSUFBUixDQUFYO0FBQ0EsSUFBTUUsT0FBT0YsUUFBUSxNQUFSLENBQWI7QUFDQSxJQUFNRyxPQUFPSCxRQUFRLE1BQVIsQ0FBYjtBQUNB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R0FBOUI7QUFDQXhDLG9CQUFZeUMsZUFBWixJQUErQlIsUUFBUVosR0FBUixDQUFZbUIsR0FBWixDQUEvQjtBQUNEO0FBSkg7QUFLRDs7QUFFRGxELE9BQUtJLGtCQUFrQiwrQkFBdkIsRUFBd0QsVUFBQ3FCLEdBQUQsRUFBTUwsS0FBTixFQUFnQjtBQUN0RSxRQUFJSyxHQUFKLEVBQ0UsTUFBTUEsR0FBTjtBQUNGTixpQkFBYVQsV0FBYixFQUEwQlUsS0FBMUI7QUFDRCxHQUpEO0FBS0QsQ0EzQ0Q7O0FBNkNBO0FBQ0FpQyxPQUFPQyxPQUFQLENBQWVaLE1BQWYsR0FBd0JBLE1BQXhCIiwiZmlsZSI6ImluZGV4LmpzIiwic291cmNlc0NvbnRlbnQiOlsiJ3VzZSBzdHJpY3QnO1xuXG4vLyBSZXBsYWNlIG1hbmlmZXN0LnltbCB0ZW1wbGF0ZSB1c2luZyBjcmVkZW50aWFscyBmaWxlIG9yIGVudmlyb25tZW50IHZhcmlhYmxlc1xuXG5jb25zdCBjb21tYW5kZXIgPSByZXF1aXJlKCdjb21tYW5kZXInKTtcbmNvbnN0IGZzID0gcmVxdWlyZSgnZnMnKTtcbmNvbnN0IGdsb2IgPSByZXF1aXJlKCdnbG9iJyk7XG5jb25zdCBwYXRoID0gcmVxdWlyZSgncGF0aCcpO1xuY29uc3QgeWFtbCA9IHJlcXVpcmUoJ2pzLXlhbWwnKTtcblxubGV0IGNyZWRlbnRpYWxzRmlsZTtcbmxldCBhYmFjdXNDb25maWdEaXI7XG5cbmNvbnN0IHBhcnNlQ29tbWFuZExpbmVBcmdzID0gKGFyZ3MpID0+IHtcbiAgY29tbWFuZGVyXG4gICAgLmFyZ3VtZW50cygnPGFiYWN1cy1jb25maWctZGlyZWN0b3J5PiBbY3JlZGVudGlhbHMtZmlsZV0nKVxuICAgIC5hY3Rpb24oZnVuY3Rpb24oY29uZmlnRGlyLCBjcmVkZW50aWFscykge1xuICAgICAgYWJhY3VzQ29uZmlnRGlyID0gY29uZmlnRGlyO1xuICAgICAgY3JlZGVudGlhbHNGaWxlID0gY3JlZGVudGlhbHM7XG4gICAgfSlcbiAgICAucGFyc2UoYXJncyk7XG59O1xuXG5jb25zdCByZXBsYWNlRW52aXJvbm1lbnRWYWx1ZXMgPSAoZW52aXJvbm1lbnQsIGNyZWRlbnRpYWxzLCBjcmVkZW50aWFsc0tleSkgPT4ge1xuICBpZiAoIWVudmlyb25tZW50KVxuICAgIHJldHVybjtcblxuICBmb3IgKGxldCBhcHBFbnZLZXkgaW4gZW52aXJvbm1lbnQpXG4gICAgaWYgKGVudmlyb25tZW50Lmhhc093blByb3BlcnR5KGFwcEVudktleSkpIHtcbiAgICAgIGNvbnN0IGFwcEVudlZhbHVlID0gZW52aXJvbm1lbnRbYXBwRW52S2V5XTtcbiAgICAgIGlmICh0eXBlb2YgYXBwRW52VmFsdWUgPT09ICdzdHJpbmcnKVxuICAgICAgICBlbnZpcm9ubWVudFthcHBFbnZLZXldID1cbiAgICAgICAgICBhcHBFbnZWYWx1ZS5yZXBsYWNlKGNyZWRlbnRpYWxzS2V5LCBjcmVkZW50aWFsc1tjcmVkZW50aWFsc0tleV0pO1xuICAgIH1cbn07XG5cbmNvbnN0IHJlcGxhY2VGaWxlcyA9IChjcmVkZW50aWFscywgZmlsZXMpID0+IHtcbiAgY29uc29sZS5sb2coJ1N1YnN0aXR1dGluZyBpbjonKTtcbiAgZm9yIChsZXQgdGVtcGxhdGVGaWxlIG9mIGZpbGVzKVxuICAgIGZzLnJlYWRGaWxlKHRlbXBsYXRlRmlsZSwgJ3V0ZjgnLCBmdW5jdGlvbihlcnIsIGNvbnRlbnQpIHtcbiAgICAgIGlmIChlcnIpXG4gICAgICAgIHRocm93IGVycjtcblxuICAgICAgY29uc3QgdGVtcGxhdGVZbWwgPSB5YW1sLmxvYWQoY29udGVudCk7XG5cbiAgICAgIGZvciAobGV0IGNyZWRlbnRpYWxzS2V5IGluIGNyZWRlbnRpYWxzKVxuICAgICAgICBmb3IgKGxldCBhcHBsaWNhdGlvbiBvZiB0ZW1wbGF0ZVltbC5hcHBsaWNhdGlvbnMpXG4gICAgICAgICAgcmVwbGFjZUVudmlyb25tZW50VmFsdWVzKGFwcGxpY2F0aW9uLmVudixcbiAgICAgICAgICAgIGNyZWRlbnRpYWxzLCBjcmVkZW50aWFsc0tleSk7XG5cbiAgICAgIGNvbnN0IHRlbXBsYXRlUGF0aCA9IHBhdGguZGlybmFtZSh0ZW1wbGF0ZUZpbGUpO1xuICAgICAgY29uc3QgdGVtcGxhdGVCYXNlTmFtZSA9IHBhdGguYmFzZW5hbWUodGVtcGxhdGVGaWxlKTtcbiAgICAgIGNvbnN0IG1hbmlmZXN0QmFzZU5hbWUgPSB0ZW1wbGF0ZUJhc2VOYW1lLnJlcGxhY2UoL1xcLnRlbXBsYXRlL2csICcnKTtcbiAgICAgIGNvbnN0IG1hbmlmZXN0RmlsZSA9IHBhdGguam9pbih0ZW1wbGF0ZVBhdGgsIG1hbmlmZXN0QmFzZU5hbWUpO1xuXG4gICAgICBjb25zdCBtYW5pZmVzdENvbnRlbnQgPSB5YW1sLmR1bXAodGVtcGxhdGVZbWwpO1xuICAgICAgZnMud3JpdGVGaWxlKG1hbmlmZXN0RmlsZSwgbWFuaWZlc3RDb250ZW50LCAndXRmOCcsIChlcnIpID0+IHtcbiAgICAgICAgaWYgKGVycilcbiAgICAgICAgICB0aHJvdyBlcnI7XG4gICAgICB9KTtcbiAgICAgIGNvbnNvbGUubG9nKCcgICAlcycsIG1hbmlmZXN0RmlsZSk7XG4gICAgfSk7XG59O1xuXG5jb25zdCBydW5DTEkgPSAoKSA9PiB7XG4gIHBhcnNlQ29tbWFuZExpbmVBcmdzKHByb2Nlc3MuYXJndik7XG5cbiAgaWYgKHR5cGVvZiBhYmFjdXNDb25maWdEaXIgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgY29uc29sZS5lcnJvcignTm8gYWJhY3VzLWNvbmZpZyBkaXJlY3Rvcnkgc3BlY2lmaWVkIScpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxuICBpZiAoIWZzLnN0YXRTeW5jKGFiYWN1c0NvbmZpZ0RpcikuaXNEaXJlY3RvcnkoKSkge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0ludmFsaWQgYWJhY3VzLWNvbmZpZyBkaXJlY3RvcnkgJXMgc3BlY2lmaWVkIScsXG4gICAgICBhYmFjdXNDb25maWdEaXIpO1xuICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgfVxuICBjb25zb2xlLmxvZygnQWJhY3VzIGNvbmZpZzogJXMnLCBhYmFjdXNDb25maWdEaXIpO1xuXG4gIGNvbnN0IGNyZWRlbnRpYWxzID0gW107XG4gIGlmIChjcmVkZW50aWFsc0ZpbGUpIHtcbiAgICBjb25zb2xlLmxvZygnVXNpbmcgY3JlZGVudGlhbHMgZmlsZTogJXMnLCBjcmVkZW50aWFsc0ZpbGUpO1xuICAgIGZzLnJlYWRGaWxlKGNyZWRlbnRpYWxzRmlsZSwgJ3V0ZjgnLCAoZXJyLCBjb250ZW50KSA9PiB7XG4gICAgICBpZiAoZXJyKVxuICAgICAgICB0aHJvdyBlcnI7XG5cbiAgICAgIGNvbnN0IGNyZWRlbnRpYWxzWW1sID0geWFtbC5sb2FkKGNvbnRlbnQpO1xuICAgICAgZm9yIChsZXQga2V5IGluIGNyZWRlbnRpYWxzWW1sKVxuICAgICAgICBpZiAoY3JlZGVudGlhbHNZbWwuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICAgIGNvbnN0IGVudlZhcmlhYmxlTmFtZSA9ICckJyArIGtleS50b1VwcGVyQ2FzZSgpLnJlcGxhY2UoLy0vZywgJ18nKTtcbiAgICAgICAgICBjcmVkZW50aWFsc1tlbnZWYXJpYWJsZU5hbWVdID0gY3JlZGVudGlhbHNZbWxba2V5XTtcbiAgICAgICAgfVxuICAgIH0pO1xuICB9XG4gIGVsc2Uge1xuICAgIGNvbnNvbGUubG9nKCdVc2luZyBlbnZpcm9ubWVudCB2YXJpYWJsZXMnKTtcbiAgICBmb3IgKGxldCBrZXkgaW4gcHJvY2Vzcy5lbnYpXG4gICAgICBpZiAocHJvY2Vzcy5lbnYuaGFzT3duUHJvcGVydHkoa2V5KSkge1xuICAgICAgICBjb25zdCBlbnZWYXJpYWJsZU5hbWUgPSAnJCcgKyBrZXk7XG4gICAgICAgIGNyZWRlbnRpYWxzW2VudlZhcmlhYmxlTmFtZV0gPSBwcm9jZXNzLmVudltrZXldO1xuICAgICAgfVxuICB9XG5cbiAgZ2xvYihhYmFjdXNDb25maWdEaXIgKyAnL2xpYi8qKi9tYW5pZmVzdC55bWwudGVtcGxhdGUnLCAoZXJyLCBmaWxlcykgPT4ge1xuICAgIGlmIChlcnIpXG4gICAgICB0aHJvdyBlcnI7XG4gICAgcmVwbGFjZUZpbGVzKGNyZWRlbnRpYWxzLCBmaWxlcyk7XG4gIH0pO1xufTtcblxuLy8gRXhwb3J0IG91ciBDTElcbm1vZHVsZS5leHBvcnRzLnJ1bkNMSSA9IHJ1bkNMSTtcbiJdfQ==
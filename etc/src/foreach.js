'use strict';

// Run a build command on a selection of modules

const _ = require('underscore');
const map = _.map;
const filter = _.filter;
const initial = _.initial;
const last = _.last;
const pairs = _.pairs;

const path = require('path');
const util = require('util');
const cp = require('child_process');
const os = require('os');
const commander = require('commander');

/* eslint no-process-exit: 1 */

// The env of the build commands
const buildenv = _.extend(process.env, {
  TERM: 'color',
  DEBUG_COLORS: 'true',
  COVERAGE_COLORS: 'true',
  FORCE_COLOR: 'true',
  MOCHA_COLORS: 'true'
});

// Throttle the number of concurrent executions of a function
const throttle = (fn, max) => {
  let running = 0;
  const queue = [];

  const run = (callargs) => {
    if (running === max) return queue.push(callargs);

    running = running + 1;
    const cb = last(callargs);
    return fn.apply(
      null,
      initial(callargs).concat([
        (err, val) => {
          cb(err, val);

          running = running - 1;
          if (queue.length) {
            const next = queue.shift();
            setImmediate(() => {
              run(next);
            });
          }
        }
      ])
    );
  };

  return function() {
    return run(arguments);
  };
};

// Execute a command in a given module directory. We throttle the number of
// concurrent jobs executing the command to a reasonable number.
const exec = throttle((cmd, cwd, cb) => {
  process.stdout.write(util.format('> %s: %s\n', cwd, cmd));
  const ex = cp.exec(cmd, {
    cwd: cwd,
    env: buildenv
  });
  ex.data = [];
  ex.stdout.on('data', (data) => {
    ex.data.push({
      s: process.stdout,
      data: data
    });
  });
  ex.stderr.on('data', (data) => {
    ex.data.push({
      s: process.stderr,
      data: data
    });
  });
  ex.on('close', (code) => {
    process.stdout.write(util.format('< %s: %s\n', cwd, cmd));
    _.map(ex.data, (d) => {
      d.s.write(d.data);
    });
    process.stdout.write('\n');

    // Call back when done
    cb(code !== 0 ? code : undefined, true);
  });
}, process.env.JOBS ? parseInt(process.env.JOBS) : Math.min(os.cpus().length, 8));

// Execute a build command for each Abacus module
const runCLI = () => {
  // Parse command line options
  commander
    .arguments('<regexp> <dir> <cmd> [args...]')
    .action((regexp, dir, cmd, args) => {
      commander.regexp = regexp;
      commander.dir = dir;
      commander.cmd = cmd;
      commander.args = args;
    })
    .parse(process.argv);

  // Use the given regular expression to filter modules
  const rx = new RegExp(commander.regexp);

  // Look for modules in the dependencies and devDependencies of the current
  // module
  const mod = require(path.join(process.cwd(), 'package.json'));
  map(
    filter(
      pairs(mod.dependencies).concat(pairs(mod.devDependencies)),
      (dep) => rx.test(dep[0]) && /^file:/.test(dep[1])
    ),
    (dependency) => {
      const resolve = (s) => s.replace(/\:name/, dependency[0]).replace(/:path/, dependency[1].split(':')[1]);

      // Run the given command on each module
      exec(resolve([commander.cmd].concat(commander.args).join(' ')), resolve(commander.dir), (err, val) => {
        if (err) process.exit(err);
      });
    }
  );
};

// Export our CLI
module.exports.runCLI = runCLI;

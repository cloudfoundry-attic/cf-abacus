'use strict';

const _ = require('underscore');
const noop = _.noop;

const cfpush = require('..');
const cp = require('child_process');
const fs = require('fs-extra');
const tmp = require('tmp');
const commander = require('commander');
const async = require('async');
const remanifester = require('../lib/remanifester.js');

const preparedManifest = 'manifest';
const adjustedManifest = 'adjusted-manifest';

const prefix = 'prefix-';
const adjustedName = 'adjusted-name';
const adjustedInstances = 3;
const adjustedConf = 'adjusted-conf';
const adjustedBuildpack = 'adjusted-buildpack';
const retryAttepmts = 3;
// const prepareZdm = true;

const stubFileSystem = () => {
  stub(fs, 'mkdir').callsFake((dirName, cb) => {
    cb();
  });

  stub(fs, 'readFile').callsFake((filename, cb) => {
    cb(undefined, preparedManifest);
  });

  stub(fs, 'writeFile').callsFake((filename, content, cb) => {
    cb();
  });

  stub(fs, 'copySync');
  stub(fs, 'existsSync').returns(true);
};

const stubTmp = (tmpDir) => {
  stub(tmp, 'setGracefulCleanup');
  stub(tmp, 'dirSync').returns(tmpDir);
};

const onCloseHandlers = {
  alwaysSuccessfulPush: (eventId, cb) => cb(),
  alwaysFailingPush: (eventId, cb) => cb(new Error()),
  successfullPushOn: (successfulAttempt) => {
    let currentAttempt = 0;

    return (eventId, cb) => {
      currentAttempt++;
      if (currentAttempt == successfulAttempt)
        cb();
      else
        cb(new Error());
    };
  }
};

const stubChildProcessWith = (onCloseFn) => {
  const stdEvent = {
    on: (undefined, cb) => {}
  };

  const executable = {
    stdout: stdEvent,
    stderr: stdEvent,
    on: stub().withArgs('close', sinon.match.any)
      .callsFake(onCloseFn)
  };

  stub(cp, 'exec').returns(executable);
};

const stubCommander = () => {
  stub(commander, 'option').returnsThis();
  stub(commander, 'parse');
  commander.name = adjustedName;
  commander.instances = adjustedInstances;
  commander.buildpack = adjustedBuildpack;
  commander.conf = adjustedConf;
  commander.prefix = prefix;
  commander.retries = retryAttepmts;
  commander.prepareZdm = true;
};

const stubRemanifester = () => {
  stub(remanifester, 'adjustManifest')
    .withArgs(preparedManifest)
    .returns(adjustedManifest);
};

const tmpDir = {
  name: 'test-tmp-dir',
  removeCallback: stub()
};

const clearStubs = () => {
  fs.writeFile.resetHistory();
  fs.copySync.resetHistory();
  tmpDir.removeCallback.resetHistory();
  cp.exec.restore();
};

stubFileSystem();
stubTmp(tmpDir);
stubCommander();
stubRemanifester();

describe('Test command line args', () => {
  const defaultRetriesAttempts = 1;

  before(() => {
    stub(async, 'series');
    process.env.CONF = 'conf';
    process.env.BUILDPACK = 'buildpack';
    process.env.ABACUS_PREFIX = 'prefix';
    cfpush.runCLI();
  });

  it('verify all arguments parsed', () => {
    const commandLineArgsCount = 8;
    assert.callCount(commander.option, commandLineArgsCount);
    assert.calledOnce(commander.parse);
  });

  it('verify optional arguments', () => {
    assert.calledWith(commander.option, '-c, --conf [value]',
      sinon.match.any, process.env.CONF);
    assert.calledWith(commander.option, '-b, --buildpack [value]',
      sinon.match.any, process.env.BUILDPACK);
    assert.calledWith(commander.option, '-x, --prefix [value]',
      sinon.match.any, process.env.ABACUS_PREFIX);
    assert.calledWith(commander.option, '-s, --start');
    assert.calledWith(commander.option, '-r, --retries [value]',
      sinon.match.any, defaultRetriesAttempts);
    assert.calledWith(commander.option, '-z, --prepare-zdm [boolean]');
  });

  it('verify mandatory arguments', () => {
    assert.calledWith(commander.option, '-n, --name <name>');
    assert.calledWith(commander.option, '-i, --instances <nb>');
  });

  after(()=>{
    async.series.restore();
  });
});

describe('Test abacus cfpush', () => {
  const manifestPath = `.cfpush/${adjustedName}-manifest.yml`;
  const cfHomeDirectory = 'path';

  before(() => {
    process.env = {
      CF_HOME: cfHomeDirectory
    };
  });

  context('when application is successfully pushed', () => {

    before(() => {
      stubChildProcessWith(onCloseHandlers.alwaysSuccessfulPush);
      cfpush.runCLI();
    });

    after(() => {
      clearStubs();
    });

    it('verify CF_HOME content is copied to tmp dir', () => {
      assert.calledWithExactly(
        fs.copySync,
        `${cfHomeDirectory}/.cf`,
        `${tmpDir.name}/.cf`);
    });

    it('verify manifest is adjusted', () => {
      assert.calledOnce(fs.writeFile);
      assert.calledWithExactly(fs.writeFile,
        manifestPath,
        adjustedManifest,
        sinon.match.any);
    });

    it('verify prepareZdm', () => {
      const appName = `${prefix}${adjustedName}`;
      const orderedCommands = {
        cfApp : `cf app ${appName}`,
        cfDelete : `cf delete -f ${appName}-old`,
        cfRename :
          `cf rename ${appName} ${appName}-old`
      };
      const envMock = sinon.match.has('env', { CF_HOME: tmpDir.name });

      assert.calledWithExactly(cp.exec, orderedCommands.cfDelete, envMock);
      assert.calledWithExactly(cp.exec, orderedCommands.cfApp, envMock);
      assert.calledWithExactly(cp.exec, orderedCommands.cfRename, envMock);

      // verify order of execution
      const calls = cp.exec.getCalls();
      for(let i = 0; i < Object.keys(orderedCommands).length; i++)
        assert.match(calls[i].args[0],
          orderedCommands[Object.keys(orderedCommands)[i]]);
    });

    it('verify cf push executed', () => {
      const executeCommandCalls = 4;

      assert.callCount(tmpDir.removeCallback, executeCommandCalls);
      assert.calledWithExactly(
        cp.exec,
        `cf push --no-start -f ${manifestPath}`,
        sinon.match.has('env',
          { CF_HOME: tmpDir.name }));
    });
  });

  context('when application push fails', () => {

    before(() => {
      commander.prepareZdm = false;
    });

    const verifyPushRetryAttempts = (expectedAttempts) => {
      assert.callCount(cp.exec, expectedAttempts);
      assert.alwaysCalledWithExactly(cp.exec,
        `cf push --no-start -f ${manifestPath}`,
        sinon.match.has('env', { CF_HOME: tmpDir.name }));
      assert.callCount(tmpDir.removeCallback, expectedAttempts);

      assert.callCount(fs.copySync, expectedAttempts);
      assert.alwaysCalledWithExactly(fs.copySync, `${cfHomeDirectory}/.cf`,
        `${tmpDir.name}/.cf`);
    };

    afterEach(() => {
      clearStubs();
    });

    it('verify cf push was retried until retry attempts is reached',
      () => {
        stubChildProcessWith(onCloseHandlers.alwaysFailingPush);

        try {
          cfpush.runCLI();
          assert.fail('Expected error to be thrown.');
        }
        catch (e) {
        // This is expected behavior
          noop();
        }

        verifyPushRetryAttempts(retryAttepmts);
      });

    it('verify cf push was retried until successful push', () => {
      const successfulAttempt = 2;
      stubChildProcessWith(
        onCloseHandlers.successfullPushOn(successfulAttempt));

      cfpush.runCLI();

      verifyPushRetryAttempts(successfulAttempt);
    });

  });

});

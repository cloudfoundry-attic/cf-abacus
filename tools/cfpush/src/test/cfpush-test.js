'use strict';

const cfpush = require('..');
const cp = require('child_process');
const fs = require('fs-extra');
const tmp = require('tmp');
const commander = require('commander');
const async = require('async');
const manifest = require('../lib/manifest.js');

const { cfPushDirname, originalManifestFilename } = require(`${__dirname}/../lib/constants.js`);
const preparedManifestContent = 'original manifest content';
const adjustedManifestContent = 'adjusted manifest content';

const prefix = 'prefix-';
const adjustedName = 'adjusted-name';
const adjustedInstances = 3;
const adjustedConf = 'adjusted-conf';
const adjustedBuildpack = 'adjusted-buildpack';
const retryAttepmts = 3;

const originalManifestRelativePath = 'path';
const unexistingManifestPath = 'error';

const substitutionVariablesFile = 'substitutionVariables.yml';

const stubFileSystem = () => {
  stub(fs, 'mkdir').callsFake((dirName, cb) => {
    cb();
  });

  const readFileStub = stub(fs, 'readFile');
  readFileStub.withArgs(`${process.cwd()}/${originalManifestRelativePath}/${originalManifestFilename}`)
    .yields(undefined, preparedManifestContent);
  readFileStub.withArgs(`${process.cwd()}/${unexistingManifestPath}/${originalManifestFilename}`)
    .yields(new Error());

  const readFileSyncStub = stub(fs, 'readFileSync');
  readFileSyncStub.withArgs(`${process.cwd()}/${originalManifestRelativePath}/${originalManifestFilename}`)
    .returns(preparedManifestContent);
  readFileSyncStub.withArgs(`${process.cwd()}/${unexistingManifestPath}/${originalManifestFilename}`)
    .throws(new Error());

  stub(fs, 'writeFile').callsFake((filename, content, cb) => {
    cb();
  });

  stub(fs, 'writeFileSync').callsFake((filename, content) => {});
  stub(fs, 'appendFileSync').callsFake((filename, content) => {});

  stub(fs, 'copySync');
  stub(fs, 'existsSync').returns(true);
};

const stubTmp = (tmpDir) => {
  stub(tmp, 'setGracefulCleanup');
  stub(tmp, 'dirSync').returns(tmpDir);
};

const returnCodes = [0, 1, 0, 0];
let retIdx = 0;

const onCloseHandlers = {
  alwaysSuccessfulPush: (eventId, cb) => cb(returnCodes[retIdx++]),
  alwaysFailingPush: (eventId, cb) => cb(new Error()),
  successfullPushOn: (successfulAttempt) => {
    let currentAttempt = 0;

    return (eventId, cb) => {
      currentAttempt++;
      if (currentAttempt === successfulAttempt) cb();
      else cb(new Error());
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
    on: stub()
      .withArgs('close', sinon.match.any)
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
  commander.path = originalManifestRelativePath;
  commander.retries = retryAttepmts;
  commander.prepareZdm = true;
};

const stubManifest = () => {
  stub(manifest, 'adjustManifest')
    .withArgs(preparedManifestContent)
    .returns(adjustedManifestContent);
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
stubManifest();

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
    const commandLineArgsCount = 9;
    assert.callCount(commander.option, commandLineArgsCount);
    assert.calledOnce(commander.parse);
  });

  it('verify optional arguments', () => {
    assert.calledWith(commander.option, '-c, --conf [value]', sinon.match.any, process.env.CONF);
    assert.calledWith(commander.option, '-b, --buildpack [value]', sinon.match.any, process.env.BUILDPACK);
    assert.calledWith(commander.option, '-x, --prefix [value]', sinon.match.any, process.env.ABACUS_PREFIX);
    assert.calledWith(commander.option, '-p, --path [value]', sinon.match.any, '.');
    assert.calledWith(commander.option, '-s, --start');
    assert.calledWith(commander.option, '-r, --retries [value]', sinon.match.any, defaultRetriesAttempts);
    assert.calledWith(commander.option, '-z, --prepare-zdm [boolean]');
  });

  it('verify mandatory arguments', () => {
    assert.calledWith(commander.option, '-n, --name <name>');
    assert.calledWith(commander.option, '-i, --instances <nb>');
  });

  after(() => {
    async.series.restore();
  });
});

describe('Test abacus cfpush', () => {
  const adjustedManifestRelativePath =
    `${originalManifestRelativePath}/${cfPushDirname}/${adjustedName}-${originalManifestFilename}`;
  const substitutionVariablesPath = `${originalManifestRelativePath}/${cfPushDirname}/${substitutionVariablesFile}`;
  const cfHomeDirectory = 'path';
  const testEnvironment = {
    CF_HOME: cfHomeDirectory,
    MORE_VARIABLES: 'dummy',
    EMPTY: undefined
  };
  const expectedEnvironment = { CF_HOME: tmpDir.name, MORE_VARIABLES: 'dummy', EMPTY: undefined };

  before(() => {
    process.env = testEnvironment;
  });

  context('without errors', () => {
    before(() => {
      stubChildProcessWith(onCloseHandlers.alwaysSuccessfulPush);
      cfpush.runCLI();
    });

    after(() => {
      clearStubs();
    });

    it('copies CF_HOME content to tmp dir', () => {
      assert.calledWithExactly(fs.copySync, `${cfHomeDirectory}/.cf`, `${tmpDir.name}/.cf`);
    });

    it('adjusts manifest', () => {
      const manifestPath = `${process.cwd()}/${adjustedManifestRelativePath}`;
      assert.calledOnce(fs.writeFile);
      assert.calledWithExactly(fs.writeFile, manifestPath, adjustedManifestContent, sinon.match.any);
    });

    it('uses substitution variables', () => {
      const varsFilePath = `${process.cwd()}/${substitutionVariablesPath}`;

      assert.calledOnce(fs.writeFileSync);
      assert.calledWithExactly(fs.writeFileSync, varsFilePath, '---\n');

      assert.calledTwice(fs.appendFileSync);
      assert.calledWithExactly(fs.appendFileSync.firstCall, varsFilePath, `CF_HOME: "${cfHomeDirectory}"\n`);
      assert.calledWithExactly(fs.appendFileSync.secondCall, varsFilePath, 'MORE_VARIABLES: "dummy"\n');
    });

    it('prepares ZDM', () => {
      const appName = `${prefix}${adjustedName}`;
      const orderedCommands = {
        cfApp: `cf app ${appName}`,
        cfAppOld: `cf app ${appName}-old`,
        cfRename: `cf rename ${appName} ${appName}-old`
      };
      const envMock = sinon.match.has('env', expectedEnvironment);

      assert.calledWithExactly(cp.exec, orderedCommands.cfApp, envMock);
      assert.calledWithExactly(cp.exec, orderedCommands.cfAppOld, envMock);
      assert.calledWithExactly(cp.exec, orderedCommands.cfRename, envMock);

      // verify order of execution
      const calls = cp.exec.getCalls();
      for (let i = 0; i < Object.keys(orderedCommands).length; i++)
        assert.match(calls[i].args[0], orderedCommands[Object.keys(orderedCommands)[i]]);
    });

    it('executes cf push', () => {
      const executeCommandCalls = 4;

      assert.callCount(tmpDir.removeCallback, executeCommandCalls);
      assert.calledWithExactly(
        cp.exec,
        'cf push --no-start ' +
          `-p ${originalManifestRelativePath} ` +
          `-f ${adjustedManifestRelativePath} ` +
          `--vars-file ${substitutionVariablesPath}`,
        sinon.match.has('env', expectedEnvironment)
      );
    });
  });

  context('when application push fails', () => {
    before(() => {
      commander.prepareZdm = false;
    });

    const verifyPushRetryAttempts = (expectedAttempts) => {
      assert.callCount(cp.exec, expectedAttempts);
      assert.alwaysCalledWithExactly(
        cp.exec,
        'cf push --no-start ' +
          `-p ${originalManifestRelativePath} ` +
          `-f ${adjustedManifestRelativePath} ` +
          `--vars-file ${substitutionVariablesPath}`,
        sinon.match.has('env', expectedEnvironment)
      );
      assert.callCount(tmpDir.removeCallback, expectedAttempts);

      assert.callCount(fs.copySync, expectedAttempts);
      assert.alwaysCalledWithExactly(fs.copySync, `${cfHomeDirectory}/.cf`, `${tmpDir.name}/.cf`);
    };

    afterEach(() => {
      clearStubs();
    });

    it('cf push was retried until retry attempts are reached', () => {
      stubChildProcessWith(onCloseHandlers.alwaysFailingPush);

      expect(cfpush.runCLI).to.throw();

      verifyPushRetryAttempts(retryAttepmts);
    });

    it('cf push was retried until successful push', () => {
      const successfulAttempt = 2;
      stubChildProcessWith(onCloseHandlers.successfullPushOn(successfulAttempt));

      cfpush.runCLI();

      verifyPushRetryAttempts(successfulAttempt);
    });
  });

  context('with missing app manifest', () => {
    before(() => {
      commander.prepareZdm = false;
      commander.path = unexistingManifestPath;
    });

    it('fails', () => {
      expect(cfpush.runCLI).to.throw();
    });
  });

});

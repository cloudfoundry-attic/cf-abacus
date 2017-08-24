'use strict';

const cfpush = require('..');
const cp = require('child_process');
const fs = require('fs-extra');
const tmp = require('tmp');
const commander = require('commander');
const remanifester = require('../lib/remanifester.js');

const preparedManifest = 'manifest';
const adjustedManifest = 'adjusted-manifest';

const prefix = 'prefix-';
const adjustedName = 'adjusted-name';
const adjustedInstances = 3;
const adjustedConf = 'adjusted-conf';
const adjustedBuildpack = 'adjusted-buildpack';

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

  stub(fs, 'existsSync').returns(false);
};

const stubTmp = (tmpDir) => {
  stub(tmp, 'setGracefulCleanup');
  stub(tmp, 'dirSync').returns(tmpDir);
};

const stubChildProcess = (error) => {
  const stdEvent = {
    on: (undefined, cb) => {}
  };

  const executable = {
    stdout: stdEvent,
    stderr: stdEvent,
    on: stub().withArgs('close', sinon.match.any)
      .callsFake((eventId, cb) => {
        cb(error);
      })
  };

  stub(cp, 'exec').returns(executable);
};

const stubCommander = () => {
  stub(commander, 'option').returns(commander);
  stub(commander, 'parse');
  commander.name = adjustedName;
  commander.instances = adjustedInstances;
  commander.buildpack = adjustedBuildpack;
  commander.conf = adjustedConf;
  commander.prefix = prefix;
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

stubFileSystem();
stubTmp(tmpDir);
stubCommander();
stubRemanifester();

describe('Test abacus cfpush', () => {
  const manifestPath = `.cfpush/${adjustedName}-manifest.yml`;

  context('when application is pushed', () => {


    before(() => {
      stubChildProcess();

      process.env = {
        CF_HOME: 'path'
      };

      cfpush.runCLI();
    });

    after(() => {
      fs.writeFile.reset();
      cp.exec.restore();
    });

    it('verify manifest is adjusted', () => {
      assert.calledWithExactly(fs.writeFile,
        manifestPath,
        adjustedManifest,
        sinon.match.any);
    });

    it('verify cf push executed', () => {
      assert.calledWithExactly(cp.exec,
      `cf push --no-start -f ${manifestPath}`,
      sinon.match.has('env', { CF_HOME: tmpDir.name }));
      assert.calledOnce(tmpDir.removeCallback);
    });
  });

  context.skip('when application push fails', () => {

    before(() => {
      stubChildProcess(new Error());

      process.env.PUSH_RETRY = 2;

      try {
        cfpush.runCLI();
      }
      catch (e) {
        console.log('Failed to push app due to:', e);
      }

    });

    after(() => {
      fs.writeFile.reset();
      cp.exec.restore();
    });

    it('verify manifest is adjusted once', () => {
      assert.calledOnce(fs.writeFile);
      assert.calledWithExactly(fs.writeFile,
        manifestPath,
        adjustedManifest,
        sinon.match.any);
    });

    it('verify cf push was retried', () => {
      assert.calledTwice(cp.exec);
      assert.calledWithExactly(cp.exec,
      `cf push --no-start -f ${manifestPath}`,
      sinon.match.has('env', { CF_HOME: tmpDir.name }));
      assert.calledOnce(tmpDir.removeCallback);
    });

  });

});

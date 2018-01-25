'use strict';

const _ = require('underscore');
const extend = _.extend;

const child = require('child_process');
const mkdirp = require('mkdirp');
const fs = require('fs');
const yaml = require('js-yaml');

const manifest = {
  applications: [
    {
      name: 'abacus-usage-accumulator',
      host: 'abacus-usage-accumulator',
      path: '.',
      instances: 1,
      memory: '512M',
      disk_quota: '512M',
      env: {
        CONF: 'default',
        DEBUG: 'e-abacus-*',
        DBCLIENT: 'abacus-mongoclient',
        AGGREGATOR: 'abacus-usage-aggregator',
        PROVISIONING: 'abacus-provisioning-plugin',
        ACCOUNT: 'abacus-account-plugin',
        EUREKA: 'abacus-eureka-plugin',
        SLACK: '5D',
        SECURED: true
      }
    }
  ]
};

const createManifestContent = (appName, testEnv) => {
  const content = extend({}, manifest);

  content.applications[0].name = appName;

  const env = content.applications[0].env;
  content.applications[0].env = extend(env, testEnv);

  return yaml.dump(content);
};

const templateContent = createManifestContent('$ACCUMULATOR_NAME', {
  TEST_VARIABLE: '$TEST_VARIABLE',
  TWO_TIMES_TEST_VARIABLE: '$TEST_VARIABLE$TEST_VARIABLE',
  ANOTHER_TEST_VARIABLE: '$ANOTHER_TEST_VARIABLE'
});
const expectedManifestContent = createManifestContent('abacus-usage-accumulator', {
  TEST_VARIABLE: 'value1',
  TWO_TIMES_TEST_VARIABLE: 'value1value1',
  ANOTHER_TEST_VARIABLE: 'value2'
});

const credentialsContent =
  '---\n' +
  'accumulator-name: abacus-usage-accumulator\n' +
  'test-variable: value1\n' +
  'another-test-variable: value2';

const replaceTemplateRoot = __dirname + '/../..';

const createTemporaryFiles = (tempDir, tempTemplateFile, tempCredentailsFile, done) => {
  mkdirp(tempDir, (err) => {
    expect(err).to.equal(null);
    fs.writeFile(tempTemplateFile, templateContent, (err) => {
      expect(err).to.equal(null);
      fs.writeFile(tempCredentailsFile, credentialsContent, (err) => {
        expect(err).to.equal(null);
        done();
      });
    });
  });
};

const deleteFolderRecursive = (path) => {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach((file) => {
      const curPath = path + '/' + file;
      if (fs.lstatSync(curPath).isDirectory()) deleteFolderRecursive(curPath);
      else fs.unlinkSync(curPath);
    });
    fs.rmdirSync(path);
  }
};

const runScript = (abacusConfigDir, credentialsFile, environment, done) => {
  const args = [];
  if (abacusConfigDir) args.push(abacusConfigDir);
  if (credentialsFile) args.push(credentialsFile);

  const replaceTemplate = child.spawn('./replace-template', args, {
    cwd: replaceTemplateRoot,
    env: extend(process.env, environment)
  });

  replaceTemplate.stdout.on('data', (data) => process.stdout.write(data));
  replaceTemplate.stderr.on('data', (data) => process.stderr.write(data));

  replaceTemplate.on('exit', (code) => {
    done(code);
  });
};

const checkManifest = (tempManifestFile, expectedContent, done) => {
  fs.readFile(tempManifestFile, 'utf8', (err, content) => {
    expect(err).to.equal(null);
    expect(content).to.equal(expectedContent);

    done();
  });
};

describe('replace-templates', () => {
  const tempConfigDir = replaceTemplateRoot + '/abacus-config';
  const tempWorkingDir = tempConfigDir + '/lib/aggregation/accumulator';
  const tempTemplateFile = tempWorkingDir + '/manifest.yml.template';
  const tempManifestFile = tempWorkingDir + '/manifest.yml';
  const tempCredentialsFile = tempWorkingDir + '/credentials.yml';

  beforeEach((done) => {
    createTemporaryFiles(tempWorkingDir, tempTemplateFile, tempCredentialsFile, done);
  });

  afterEach(() => {
    deleteFolderRecursive(tempConfigDir);
  });

  context('when using environment variables', () => {
    beforeEach((done) => {
      runScript(
        tempConfigDir,
        undefined,
        {
          ACCUMULATOR_NAME: 'abacus-usage-accumulator',
          TEST_VARIABLE: 'value1',
          ANOTHER_TEST_VARIABLE: 'value2'
        },
        (code) => {
          expect(code).to.equal(0);
          done();
        }
      );
    });

    it('replaces all placeholders in template', (done) => {
      checkManifest(tempManifestFile, expectedManifestContent, done);
    });
  });

  context('when using credentials file', () => {
    beforeEach((done) => {
      runScript(tempConfigDir, tempCredentialsFile, undefined, (code) => {
        expect(code).to.equal(0);
        done();
      });
    });

    it('replaces all placeholders in template', (done) => {
      checkManifest(tempManifestFile, expectedManifestContent, done);
    });
  });

  context('with both credentials file and environment', () => {
    beforeEach((done) => {
      runScript(
        tempConfigDir,
        tempCredentialsFile,
        {
          TEST_VARIABLE: 'invalid_value1',
          ANOTHER_TEST_VARIABLE: 'invalid_value2'
        },
        (code) => {
          expect(code).to.equal(0);
          done();
        }
      );
    });

    it('replaces all placeholders using credentials file', (done) => {
      checkManifest(tempManifestFile, expectedManifestContent, done);
    });
  });

  context('without abacus-config', () => {
    context('without credentials', () => {
      it('errors', (done) => {
        runScript(undefined, undefined, undefined, (code) => {
          expect(code).to.equal(1);
          done();
        });
      });
    });

    context('with credentials', () => {
      it('errors', (done) => {
        runScript(undefined, tempCredentialsFile, undefined, (code) => {
          expect(code).to.equal(1);
          done();
        });
      });
    });
  });
});

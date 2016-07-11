# abacus-pipeline
CF-Abacus Concourse Pipeline

## Running the testing pipeline

1. Start Concourse:

  ```bash
   cd ~/workspace/cf-abacus/etc/concourse 
   vagrant up
   ```

2. Download `fly` CLI:

   Mac OSX:
   ```bash
   curl 'http://192.168.100.4:8080/api/v1/cli?arch=amd64&platform=darwin' --compressed -o fly
   chmod +x fly
   ```
   Linux:
   ```bash
   curl 'http://192.168.100.4:8080/api/v1/cli?arch=amd64&platform=linux' --compressed -o fly
   chmod +x fly
   ```
   
   Windows:
   Go to http://192.168.100.4:8080/api/v1/cli?arch=amd64&platform=windows

3. Add `fly` to your path

4. Change the entries in the `test-pipeline-vars.yml` file to reflect the actual users, passwords and domains of your Cloud Foundry landscape.

5. Upload the pipeline
   ```bash
   fly --target=lite login --concourse-url=http://192.168.100.4:8080
   echo "y" | fly --target=lite set-pipeline --pipeline=abacus-test --config=test-pipeline.yml --load-vars-from=test-pipeline-vars.yml ---non-interactive
   fly --target=lite unpause-pipeline --pipeline=abacus-test
   ```

6. Check the pipeline at http://192.168.100.4:8080/

## Running the deployment pipeline

You should have the Concourse running by now. To run the deployment pipeline follow these steps:

1. Create a "landscape" repository that contains submodules for:
   * anything else specific for the landscape (Cloud Foundry, DBs, ...)
   * Abacus
   * `abacus-config` directory with custom Abacus settings (see next step)

2. The Abacus configuration `abacus-config`, should contain:
   * pipeline configuration in `deploy-pipeline-vars.yml`
   * application manifests: `manifest.yml`
   * number of applications and instances in `.apprc` for each Abacus pipeline stage (often needed for collector and reporting)
   * profiles in `etc/apps.rc` (to add additional apps such as `cf-bridge` and `cf-renewer`)

   The file structure should be the same as the abacus project:
    ```
    .
    |____deploy-pipeline-vars.yml
    |____etc
    | |____apps.rc
    |____lib
    | |____aggregation
    | | |____accumulator
    | | | |____manifest.yml
    | | |____aggregator
    | | | |____manifest.yml
    | | |____reporting
    | | | |____.apprc
    | | | |____manifest.yml
    | |____cf
    | | |____bridge
    | | | |____manifest.yml
    | |____metering
    | | |____collector
    | | | |____.apprc
    | | | |____manifest.yml
    | | |____meter
    | | | |____manifest.yml
    | |____plugins
    | | |____account
    | | | |____manifest.yml
    | | |____authserver
    | | | |____manifest.yml
    | | |____eureka
    | | | |____manifest.yml
    | | |____provisioning
    | | | |____manifest.yml
    | |____utils
    | | |____pouchserver
    | | | |____manifest.yml
    ```

3. Customize the `deploy-pipeline-vars.yml` file with the location of the landscape repository

4. Upload the pipeline:
   ```bash
   echo "y" | fly --target=lite set-pipeline --pipeline=abacus-deploy --config=deploy-pipeline.yml --load-vars-from=deploy-pipeline-vars.yml ---non-interactive
   fly --target=lite unpause-pipeline --pipeline=abacus-deploy
   ```
5. Check the pipeline at http://192.168.100.4:8080/

## Docker files

The `docker` directory contains several `Dockerfile`s used to build the images used in the pipeline.

You can build and push the images to your own repo, using the `publish` script:
```bash
cd ~/workspace/cf-abacus/etc/concourse/docker
./publish myrepository
```

To build & push changes in a single image (for example `node-mongodb-0.12`), execute:

```bash
cd docker/node-mongodb-0.12
docker build -t myrepository/node-mongodb:0.12 .
docker login
docker push myrepository/node-mongodb:0.12
```

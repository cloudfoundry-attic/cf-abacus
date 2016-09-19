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
   * application manifest templates: `manifest.yml.template`.
   Templates can contain environment variables. The pipeline will replace them and generate the `manifest.yml` files in the proper directories.
   * number of applications and instances in `.apprc` for each Abacus pipeline stage (often needed for collector and reporting)
   * profiles in `etc/apps.rc` (to add additional apps such as `cf-bridge` and `cf-renewer`)

   The file structure should be the same as the abacus project:
    ```
    .
    ├── deploy-pipeline-vars.yml
    ├── README.md
    ├── etc
    │   └── apps.rc
    ├── lib
    │   ├── aggregation
    │   │   ├── accumulator
    │   │   │   └── manifest.yml.template
    │   │   ├── aggregator
    │   │   │   └── manifest.yml.template
    │   │   └── reporting
    │   │       └── manifest.yml.template
    │   ├── cf
    │   │   ├── bridge
    │   │   │   └── manifest.yml.template
    │   │   └── renewer
    │   │       └── manifest.yml.template
    │   ├── metering
    │   │   ├── collector
    │   │   │   └── manifest.yml.template
    │   │   └── meter
    │   │       └── manifest.yml.template
    │   ├── plugins
    │   │   ├── account
    │   │   │   └── manifest.yml.template
    │   │   ├── authserver
    │   │   │   └── manifest.yml.template
    │   │   ├── eureka
    │   │   │   └── manifest.yml.template
    │   │   └── provisioning
    │   │       └── manifest.yml.template
    │   └── utils
    │       └── pouchserver
    │           └── manifest.yml.template
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

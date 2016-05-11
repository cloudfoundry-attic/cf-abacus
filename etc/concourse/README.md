# abacus-pipeline
CF-Abacus Concourse Pipeline

## Running the pipeline

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

4. Change the entries in the `pipeline-vars.yml` file to reflect the actual users, passwords and domains of your Cloud Foundry landscape.

5. Upload the pipeline
   ```bash
   fly --target=lite login --concourse-url=http://192.168.100.4:8080
   echo "y" | fly --target=lite set-pipeline --pipeline=abacus-test --config=pipeline.yml --load-vars-from=pipeline-vars.yml ---non-interactive
   fly --target=lite unpause-pipeline --pipeline=abacus
   ```

6. Check the pipeline at http://192.168.100.4:8080/

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
docker build -t godofcontainers/node-mongodb:0.12 .
docker login
docker push godofcontainers/node-mongodb:0.12
```

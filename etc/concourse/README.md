# abacus-pipeline
CF-Abacus Concourse Pipeline

## Running the pipeline

1. Start Concourse:

  ```bash
   cd ~/workspace/cf-abacus/etc/concourse 
   vagrant up
   ```

2. Download `fly` CLI:

   ```bash
   # Mac OSX:
   curl 'http://192.168.100.4:8080/api/v1/cli?arch=amd64&platform=darwin' --compressed -o fly
   chmod +x fly
   
   # Linux:
   curl 'http://192.168.100.4:8080/api/v1/cli?arch=amd64&platform=linux' --compressed -o fly
   chmod +x fly
   
   # Windows - Go to 
   http://192.168.100.4:8080/api/v1/cli?arch=amd64&platform=windows
   ```

3. Upload the pipeline
   ```bash
   ./fly --target=lite login --concourse-url=http://192.168.100.4:8080
   ./fly --target=lite set-pipeline --pipeline=abacus --config=pipeline.yml --non-interactive
   ./fly --target=lite unpause-pipeline --pipeline=abacus
   ```

4. Check the pipeline at http://192.168.100.4:8080/

## Docker files

Build & Push with:

```
cd docker/node-mongodb-0.12
docker build -t godofcontainers/node-mongodb:0.12 .
docker login
docker push godofcontainers/node-mongodb:0.12
```


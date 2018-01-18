The `etc/docker` directory contains the `Dockerfile`s needed to build the custom images used in the pipeline.

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

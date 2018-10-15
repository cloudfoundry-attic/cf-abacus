abacus-cloud-controller-dependency-test
===

:information_source: In order to run the cloud controller dependency test, export the following environment variables:

```bash
export CF_API_URI=https://api.<domain>
export CF_ADMIN_USER=admin
export CF_ADMIN_PASSWORD=<password>
export CLOUD_CONTROLLER_CLIENT_ID=<client-id>
export CLOUD_CONTROLLER_CLIENT_SECRET=<secret>

```

Then run the following commands:

```bash
cd cf-abacus
yarn provision
cd test/dependency/cloud-controller
yarn run dependency
```


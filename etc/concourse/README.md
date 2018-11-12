## Setup

To setup Concourse refer to its documentation.

For local testing you can use Docker Compose as described in the [Getting Started](https://concourse-ci.org/getting-started.html):
```bash
wget https://concourse-ci.org/docker-compose.yml
docker-compose up
```

## Profiles

The size of the Abacus installation is configured using predefined installation profiles. Several flavors exist depending on the target use case as follows:

- small - basic profile intended for development purposes. Non HA setup with minimal amount of nodes.

- medium - defined as minimal productive installation this profile is HA but has small memory footprint. It is best used on staging and integration environments.

- large - intended for production deployments on environments with low or moderate loads.

- xlarge - for productive deployments with high load that need to scale  (e.g. providing a service on public cloud platform). 

- xlarge-staging - the same as xlarge but uses less resources. It is designed to be used for pre-production (validation) environments.

# abacus-pipeline
CF-Abacus [Concourse](http://concourse.ci/) Pipelines

## Setting up the pipeline

1. [Install Concourse](http://concourse.ci/installing.html)

1. Check the [Using Concourse](http://concourse.ci/using-concourse.html) guide

1. Create a "landscape" repository that contains submodules for:
   * anything else specific for the landscape (Cloud Foundry, DBs, ...)
   * Abacus
   * `abacus-config` directory with custom Abacus settings (see next step)

1. The Abacus configuration `abacus-config`, should contain:
   * pipeline configuration in `deploy-pipeline-vars.yml`
   * application manifest templates: `manifest.yml.template`.
   * number of applications and instances in `.apprc` for each Abacus pipeline stage (often needed for collector and reporting)
   * profiles in `etc/apps.rc` (to add additional apps such as `cf-bridge` and `cf-renewer`)

   The file structure should be the same as the abacus project:
    ```
    .
    ├── deploy-pipeline-vars.yml
    ├── acceptance-test-pipeline-vars.yml
    ├── README.md
    ├── acceptance
    │   ├── etc
    │   │   └── apps.rc
    │   └── lib
    │       ├── aggregation
    │       │   ├── accumulator
    │       │   │   └── manifest.yml.template
    │       │   ├── aggregator
    │       │   │   └── manifest.yml.template
    │       │   └── reporting
    │       │       └── manifest.yml.template
    │       ├── cf
    │       │   ├── applications
    │       │   │   └── manifest.yml.template
    │       │   ├── services
    │       │   │   └── manifest.yml.template
    │       │   └── renewer
    │       │       └── manifest.yml.template
    │       ├── metering
    │       │   ├── collector
    │       │   │   └── manifest.yml.template
    │       │   └── meter
    │       │       └── manifest.yml.template
    │       └── plugins
    │           ├── account
    │           │   └── manifest.yml.template
    │           ├── authserver
    │           │   └── manifest.yml.template
    │           ├── eureka
    │           │   └── manifest.yml.template
    │           └── provisioning
    │               └── manifest.yml.template
    ├── deploy
    │   ├── etc
    │   │   └── apps.rc
    │   └── lib
    │       ├── aggregation
    │       │   ├── accumulator
    │       │   │   └── manifest.yml.template
    │       │   ├── aggregator
    │       │   │   └── manifest.yml.template
    │       │   └── reporting
    │       │       └── manifest.yml.template
    │       ├── cf
    │       │   ├── bridge
    │       │   │   └── manifest.yml.template
    │       │   └── renewer
    │       │       └── manifest.yml.template
    │       ├── metering
    │       │   ├── collector
    │       │   │   └── manifest.yml.template
    │       │   └── meter
    │       │       └── manifest.yml.template
    │       └── plugins
    │           ├── account
    │           │   └── manifest.yml.template
    │           ├── authserver
    │           │   └── manifest.yml.template
    │           ├── eureka
    │           │   └── manifest.yml.template
    │           └── provisioning
    │               └── manifest.yml.template
    └── test
        └── lib
            ├── aggregation
            │   ├── accumulator
            │   │   └── manifest.yml.template
            │   ├── aggregator
            │   │   └── manifest.yml.template
            │   └── reporting
            │       └── manifest.yml.template
            ├── metering
            │   ├── collector
            │   │   └── manifest.yml.template
            │   └── meter
            │       └── manifest.yml.template
            └── plugins
                ├── account
                │   └── manifest.yml.template
                ├── authserver
                │   └── manifest.yml.template
                ├── eureka
                │   └── manifest.yml.template
                └── provisioning
                    └── manifest.yml.template
    ```

## Test pipeline

1. Change the entries in the `test-pipeline-vars.yml` file to reflect the actual users, passwords and domains of your Cloud Foundry landscape.

1. Upload the pipeline
   ```bash
   fly --target=lite login --concourse-url=http://192.168.100.4:8080
   echo "y" | fly --target=lite set-pipeline --pipeline=abacus-test --config=test-pipeline.yml --load-vars-from=test-pipeline-vars.yml ---non-interactive
   fly --target=lite unpause-pipeline --pipeline=abacus-test
   ```

1. Check the pipeline at http://192.168.100.4:8080/


### Deploy pipeline

1. Customize the `deploy-pipeline-vars.yml` file with the location of the landscape repository

1. Upload the pipeline:
   ```bash
   echo "y" | fly --target=lite set-pipeline --pipeline=abacus-deploy --config=deploy-pipeline.yml --load-vars-from=deploy-pipeline-vars.yml ---non-interactive
   fly --target=lite unpause-pipeline --pipeline=abacus-deploy
   ```
1. Check the pipeline at http://192.168.100.4:8080/

### Acceptance test pipeline

1. Customize the `acceptance-test-pipeline-vars.yml` file with the location of the landscape repository

1. Upload the pipeline:
   ```bash
   echo "y" | fly --target=lite set-pipeline --pipeline=abacus-acceptance --config=acceptance-test-pipeline.yml --load-vars-from=acceptance-test-pipeline-vars.yml ---non-interactive
   fly --target=lite unpause-pipeline --pipeline=abacus-acceptance
   ```
1. Check the pipeline at http://192.168.100.4:8080/

## Templates

Manifest templates can contain environment variables. The pipeline will replace them and generate the `manifest.yml` files in the proper directories.

An example template can look like this:

```yml
applications:
- name: abacus-usage-accumulator
  host: abacus-usage-accumulator
  path: .
  instances: 1
  memory: 512M
  disk_quota: 512M
  env:
    CONF: default
    DEBUG: e-abacus-*
    AGGREGATOR: abacus-usage-aggregator
    PROVISIONING: abacus-provisioning-plugin
    ACCOUNT: abacus-account-plugin
    EUREKA: abacus-eureka-plugin
    SLACK: 5D
    SECURED: true
    AUTH_SERVER: $AUTH_SERVER
    CLIENT_ID: $SYSTEM_CLIENT_ID
    CLIENT_SECRET: $SYSTEM_CLIENT_SECRET
    JWTALGO: $JWTALGO
    JWTKEY: |+
      $JWTKEY
```

All variables in the format: $&lt;VARIABLE&gt; will be substituted with the value that is given to the pipeline (with the [deploy-pipeline-vars.yml](https://github.com/cloudfoundry-incubator/cf-abacus/blob/3cb401215f8ae7b66450c48328316afbf2b669f8/etc/concourse/deploy-pipeline-vars.yml)) as:
```yml
auth-server: http://auth-server.com
system-client-id: client
system-client-secret: secret
jwtkey: |
      -----BEGIN PUBLIC KEY-----
      ... insert key here ...
      -----END PUBLIC KEY-----
jwtalgo: algo
```

## Monitoring pipeline
You can run the monitoring pipeline separately, or you can configure it to send status reports to grafana.
For setting up grafana you can refer to the [official documentation](http://docs.grafana.org/installation/).

You should have running Concourse and fly-cli installed. If not refer to `Running the testing pipeline`

1. Adjust the [`monitoring-pipeline-vars.yml`](https://github.com/cloudfoundry-incubator/cf-abacus/blob/master/etc/concourse/monitor-pipeline-vars.yml) to match your configuration.
1. Upload the pipeline:
``` bash
echo "y" | fly --target=lite set-pipeline --pipeline=monitor-abacus --config=monitor-pipeline.yml --load-vars-from=monitor-pipeline-vars.yml --non-interactive
fly --target=lite unpause-pipeline --pipeline=monitor-abacus
```

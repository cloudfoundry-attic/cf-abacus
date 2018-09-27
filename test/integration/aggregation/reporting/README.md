abacus-usage-reporting-integration-test
===

:information_source: In order to run the test locally, make sure you run the following commands:

```bash
cd cf-abacus
docker-compose up -d
source bin/localdb
yarn provision
cd test/integration/aggregation/reporting
yarn run integration
```

Test data genrated with:
```bash
export SLACK=3D
export TIME_WINDOWS_SIZES='{ "D" : 6 }'
yarn start && yarn smoke

# generate ratedUsage.json
# 1. List all docs in abacus-aggregator-aggregated-usage
# 2. Merge them in array in ratedUsage.json

# generate report.json
curl -H 'Content-Type: application/json' http://localhost:9088/v1/metering/organizations/us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/aggregated/usage | jq . > report.json

# generate offset_report.json
yarn stop
export ABACUS_TIME_OFFSET=345600000
yarn start
export DATE_IN_MS=$(node -e "console.log(new Date().valueOf() + 345600000)")
curl -H 'Content-Type: application/json' "http://localhost:9088/v1/metering/organizations/us-south:a3d7fe4d-3cb1-4cc3-a831-ffe98e20cf27/aggregated/usage/$DATE_IN_MS" | jq . > offset_report.json
```
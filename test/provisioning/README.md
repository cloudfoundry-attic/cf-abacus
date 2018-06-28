abacus-provisioning-itest
===

Provisioning plugin integration test

Set the following environment variables:

```bash
API=https://api.<system domain>
AUTH_SERVER=https://uaa.<system domain>
CF_ADMIN_USER=admin
CF_ADMIN_PASSWORD=password
CF_ORG=<organization to use>
CF_SPACE=<space to use for testing>
CLIENT_SECRET=test-secret
COLLECTOR_URL=https://abacus-usage-collector.<domain>
REPORTING_URL=https://abacus-usage-reporting.<domain>
SYSTEM_CLIENT_ID=abacus
SYSTEM_CLIENT_SECRET=secret
UAA_SECRET=<UAA admin secret>

# optional; set if self-signed certificate is used
SKIP_SSL_VALIDATION=true
```

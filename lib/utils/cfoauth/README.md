OAuth helper module for abacus
===
A simple wrapper to retrieve CF OAuth token, provides two functions
 
* tokenEndpoint - retrieve token endpoint host from the CF API host
* newToken - retrieve new OAuth token from the token endpoint. The returned token is augmented with 
expiry property storing storing time (milliseconds) when the token will expire

Supports the following environment variables

* API_HOST_NAME - Cloud Foundry api host
* TOKEN_ENDPOINT - URL to get tokens (can be looked up using API_HOST_NAME)
* CLIENT_ID - client credentials
* CLIENT_SECRET - client credentials

Trying the module
---
* cd lib/utils/cfoauth/
* npm install
* npm run babel
* npm test

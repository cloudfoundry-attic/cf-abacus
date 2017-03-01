abacus-webhook
===

Wrapper around the request module providing an easy way to implement a Webhook.

Make an http post request to a list of subscriptions.  This module behaves
similarly to [request](https://github.com/request/request) except that it
takes an array of endpoints as input and its default request type is post
instead of get.

Usage
---

Post a message to a list of subscribers

```javascript
  const webhook = require('abacus-webhook');

  const endpoints = ['https://foo.com/bar', 'https://bar.com/foo'];

  const body = {
    event: 'account_region_move',
    account_id: '5d32efa8-8572-4388-b026-aebddc7e42c7',
    old_pricing_country: 'USA',
    new_pricing_country: 'CAD'
  };

  const options = {
    json: body,
    // Send messages one at a time.
    concurrency: 1
  };

  webhook(endpoints, options, (error, responses) => {
    if(!error)
      responses.map((response) => {
        // Do more stuff
      });
  });
```

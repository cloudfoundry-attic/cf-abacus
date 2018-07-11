'use strict';

const scopesConst = require('./scopes');

const scopesExist = (request) => request.context && request.context.oauth && request.context.oauth.scopes;

const resourceScopesExist = (scopes) => (scopes.readResourceScopes && scopes.readResourceScopes[0]) ||
    (scopes.writeResourceScopes && scopes.writeResourceScopes[0]);

const hasSystemScope = (scopes) => scopes.hasSystemReadScope || scopes.hasSystemWriteScope;

const getCorrectScope = (scopes) => {
  if (hasSystemScope(scopes))
    return scopesConst.SYSTEM;
  if (resourceScopesExist(scopes))
    return scopes.readResourceScopes[0] || scopes.writeResourceScopes[0];

  return scopesConst.UNKNOWN;
};

module.exports = (request, secured) => {
  if (secured) {
    if (scopesExist(request))
      return getCorrectScope(request.context.oauth.scopes);
    return scopesConst.UNKNOWN;
  }
  return scopesConst.UNSECURED;
};

'use strict';
/* eslint-disable max-len*/
require('./lib/index.js');

const DBInterface = require('../db/DbUtilsInterface');
const interfaceObj = new DBInterface();

const assert = chai.assert;
describe('DbUtilsInterface', () => {
  beforeEach(() => {});
  it('throws error', () => {
    assert.throws(interfaceObj.upsert, 'Method upsert not implemented by subclass');
  });
  it('throws error', () => {
    assert.throws(interfaceObj.fetchRecords, 'Method fetchRecords not implemented by subclass');
  });
  it('throws error', () => {
    assert.throws(interfaceObj.saveCSSToDB, 'Method saveCSSTODB not implemented by subclass');
  });
  it('throws error', () => {
    assert.throws(interfaceObj.getCSSFromDB, 'Method getCSSFromDB not implemented by subclass');
  });
  it('throws error', () => {
    assert.throws(interfaceObj.removeRecords, 'Method removeRecords not implemented by subclass');
  });
});

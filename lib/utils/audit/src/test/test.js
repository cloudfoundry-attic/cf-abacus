'use strict';

const audit = require('..');

describe('abacus-audit', () => {
  const defaultConsoleLog = console.log;

  let fakeConsoleLog;

  beforeEach(() => {
    fakeConsoleLog = spy(() => {});
    console.log = fakeConsoleLog;
  });

  afterEach(() => {
    console.log = defaultConsoleLog;
  });

  it('prints to console.log with audit prefix', () => {
    audit('when %d + %d, then %d', 2, 3, 5);

    expect(fakeConsoleLog.callCount).to.equal(1);
    let callArgs = fakeConsoleLog.args[0];
    expect(callArgs[0]).to.equal('[audit] when %d + %d, then %d');
    expect(callArgs[1]).to.equal(2);
    expect(callArgs[2]).to.equal(3);
    expect(callArgs[3]).to.equal(5);
  });
});

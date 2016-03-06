'use strict';

// A wrapper around the popular debug log module, with the ability to
// dynamically enable / disable logging.

process.env.DEBUG_COLORS = 'no';
const debug = require('..');

describe('abacus-debug', () => {
  const now = Date.now();
  let clock;
  let clog;
  beforeEach(() => {
    // Setup fake timers
    clock = sinon.useFakeTimers(now,
      'Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval');

    // Save console log function as tests mock it
    clog = console.log;
  });

  afterEach(() => {
    // Restore original timers
    clock.restore();

    // Restore original console.log function
    console.log = clog;
  });

  it('logs messages', () => {
    // Mock console log
    console.log = spy(console.log);

    // Log a message
    debug.enable('test');
    const d = debug('test');
    d('Hey');

    expect(
      console.log.args[0][0]).to.match(new RegExp(new Date(now).toISOString()));
    expect(console.log.args[0][0]).to.match(/test %s Hey/);
    expect(console.log.args[0][1]).to.equal(process.pid);
  });

  it('is dynamically configurable', () => {
    // Enable / disable log
    debug.enable('test');
    const d = debug('test');

    // Register a config listener
    const l = spy();
    debug.on('config', l);

    // Expect dynamic config to be applied right away
    expect(d.enabled()).to.equal(true);

    debug.disable();
    expect(d.enabled()).to.equal(false);

    debug.enable('enabled');
    expect(d.enabled()).to.equal(true);

    debug.disable();
    expect(d.enabled()).to.equal(false);

    debug.enable('test');
    expect(d.enabled()).to.equal(true);
  });

  it('formats objects and errors', () => {
    // Mock console log
    console.log = spy();

    // Log an object and an error
    debug.enable('test');
    const o = {
      x: 123,
      y: 'abc'
    };
    const e = new Error();
    e.message = 'Something broke';

    const d = debug('test');
    d('Huh %o %o', o, e);

    // Expect the object and error to be formatted
    expect(console.log.args[0][0]).to.match(new RegExp('test %s Huh { x: ' +
      '123, y: \'abc\' } { message: \'Something broke\' } - Error: Something' +
      ' broke'));
    expect(console.log.args[0][1]).to.equal(process.pid);
  });

  it('logs objects', () => {
    // Mock console log
    console.log = spy();

    // Log an object
    debug.enable('test');
    const o = {
      x: 456,
      y: 'xyz'
    };
    const d = debug('test');
    d(o);

    // Expect the object to be logged as is
    expect(console.log.args[0][0]).to.match(/test %s/);
    expect(console.log.args[0][1]).to.equal(process.pid);
    expect(console.log.args[0][2]).to.equal(o);
  });

  it('truncates long strings', () => {
    // Mock console log
    console.log = spy();

    // Log a big string
    debug.enable('test');
    const s = Array(2048).join('x');
    const d = debug('test');
    d('Truncate %o', s);

    // Expect the string to be truncated
    expect(console.log.args[0][0]).to.match(
      new RegExp('test %s Truncate \'' + s.substring(0, 1023) + '\.\.\.'));
    expect(console.log.args[0][1]).to.equal(process.pid);
  });


  it('externalizes objects and errors', () => {
    // Externalize an object
    const o = {
      x: 123,
      y: 'abc'
    };
    expect(debug.externalize(o)).to.deep.equal(o);

    // Externalize errors with a message and a code
    const e1 = new Error();
    e1.message = 'Something broke';
    expect(debug.externalize(e1)).to.equal('Something broke');

    const e2 = new Error();
    e2.code = 123;
    expect(debug.externalize(e2)).to.equal(123);
  });

});


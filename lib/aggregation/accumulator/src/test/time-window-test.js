'use strict';

const createTimeWindow = require('../time-windows.js');
const dimension = createTimeWindow.dimension;


describe('accumulator/time-window', () => {

  context('when windows sizes are provided', () => {
    it('expect windows to be initialized', () => {
      const timeWindow = createTimeWindow({}, { [dimension.min]: 2 });
      const windows = timeWindow.getWindows(dimension.min);
      expect(windows).to.deep.equal([null, null]);
    });
  });

  context('when windows sizes are not provided', () => {

    context('when slack period is within its dimension', () => {
      it('expect slack + 1 windows intitialized', () => {
        const timeWindow = createTimeWindow(
          { scale : dimension.min, width : 3 });
        const windows = timeWindow.getWindows(dimension.min);
        expect(windows).to.deep.equal([null, null, null, null]);
      });
    });

    context('when slack period afects the next dimension', () => {
      it('expect (width div <dimension size>) + 1 windows initialized', () => {
        const timeWindow = createTimeWindow(
          { scale : dimension.day, width : 30 });
        const windows = timeWindow.getWindows(dimension.month);
        expect(windows).to.deep.equal([null, null, null]);
      });
    });
  });

});



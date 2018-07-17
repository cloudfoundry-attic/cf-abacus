'use strict';

const { Bulletin } = require('../lib/bulletin');
const { times } = require('underscore');

describe('bulletin', () => {
  const bulletinName = 'bulletin-name';
  const startTime = 1531483200000; // 2018-07-13 12:00:00

  let clock;
  let bulletin;

  const doPost = (index) => {
    bulletin.post('post ' + index);
    clock.tick(1000);
  };

  beforeEach(() => {
    clock = sinon.useFakeTimers(startTime);
    bulletin = new Bulletin(bulletinName);
  });

  afterEach(() => {
    clock.restore();
  });

  it('is possible to get name', () => {
    expect(bulletin.name).to.equal(bulletinName);
  });

  it('has default capacity of 3', () => {
    expect(bulletin.capacity).to.equal(3);
  });

  describe('summary', () => {
    const getPost = () => {
      const summary = bulletin.summary();
      return summary.post;
    };
    it('returns undefined post', () => {
      const post = getPost();
      expect(post).to.equal(undefined);
    });

    it('returns last post on many posts', () => {
      times(4, doPost);
      const post = getPost();
      expect(post).to.deep.equal({
        'timestamp': '2018-07-13T12:00:03.000Z',
        'message': 'post 3'
      });
    });
  });

  describe('report', () => {
    const getPosts = () => {
      const report = bulletin.report();
      return report.posts;
    };

    it('returns empty posts array on no posts', () => {
      expect(getPosts()).to.deep.equal([]);
    });

    it('returns compact posts array on posts below capacity', () => {
      times(1, doPost);
      expect(getPosts()).to.deep.equal([
        {
          'timestamp': '2018-07-13T12:00:00.000Z',
          'message': 'post 0'
        }
      ]);
    });

    it('returns all posts on posts at capacity', () => {
      times(3, doPost);
      expect(getPosts()).to.deep.equal([
        {
          'timestamp': '2018-07-13T12:00:00.000Z',
          'message': 'post 0'
        },
        {
          'timestamp': '2018-07-13T12:00:01.000Z',
          'message': 'post 1'
        },
        {
          'timestamp': '2018-07-13T12:00:02.000Z',
          'message': 'post 2'
        }
      ]);
    });

    it('returns last posts on posts above capacity', () => {
      times(8, doPost);
      expect(getPosts()).to.deep.equal([
        {
          'timestamp': '2018-07-13T12:00:05.000Z',
          'message': 'post 5'
        },
        {
          'timestamp': '2018-07-13T12:00:06.000Z',
          'message': 'post 6'
        },
        {
          'timestamp': '2018-07-13T12:00:07.000Z',
          'message': 'post 7'
        }
      ]);
    });
  });
});

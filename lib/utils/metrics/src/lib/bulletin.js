'use strict';

const moment = require('abacus-moment');

class Bulletin {
  constructor(name) {
    this.name = name;
    this.posts = new Array(3);
    this.insertIndex = 0;
  }

  get capacity() {
    return this.posts.length;
  }

  post(message) {
    const boundedIndex = this.insertIndex % this.capacity;
    this.posts[boundedIndex] = {
      timestamp: moment.utc().toISOString(),
      message: message
    };
    this.insertIndex++;
  }

  summary() {
    const lastPost = this.getPostAtIndex(this.insertIndex - 1);
    return {
      post: lastPost ? lastPost : undefined
    };
  }

  report() {
    const start = Math.max(0, this.insertIndex - this.capacity);
    const end = this.insertIndex - 1;

    const posts = [];
    for (let index = start; index <= end; index++) {
      const post = this.getPostAtIndex(index);
      posts.push(post);
    }

    return {
      posts
    };
  }

  getPostAtIndex(index) {
    if (index < 0)
      return null;

    const boundedIndex = index % this.capacity;
    return this.posts[boundedIndex];
  }
};

module.exports = {
  Bulletin
};

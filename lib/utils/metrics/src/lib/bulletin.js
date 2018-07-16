'use strict';

class Bulletin {
  constructor(name) {
    this.name = name;
    this.posts = new Array(3);
    this.insertIndex = 0;
  }

  get capacity() {
    return this.posts.length;
  }

  post(line) {
    const offset = this.insertIndex % this.capacity;
    this.posts[offset] = line;
    this.insertIndex++;
  }

  summary() {
    let start = Math.max(0, this.insertIndex - this.capacity);
    let end = this.insertIndex - 1;

    let posts = [];
    for (let index = start; index <= end; index++) {
      const offset = index % this.capacity;
      posts.push(this.posts[offset]);
    }

    return {
      posts
    };
  }
};

module.exports = {
  Bulletin
};

'use strict';

const buildPath = (...segments) => {
  const encodedSegments = segments.map((segment) => encodeURIComponent(segment));
  return '/' + encodedSegments.join('/');
};

module.exports = {
  buildPath
};

function Queue (name, options) {
  options = options || {};

  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('missing or empty name for Queue');
  }
  if (typeof options.client === 'undefined') {
    throw new Error('missing redis client in options for Queue');
  }

  this.name = name;
  this.options = options;
  this.client = options.client;
}

module.exports = Queue;
var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , idgen = require('idgen');

function Queue (name, options) {
  var self = this;

  options = options || {};

  if (typeof name !== 'string' || name.length === 0) {
    throw new Error('missing or empty name for Queue');
  }
  if (typeof options.client === 'undefined') {
    throw new Error('missing redis client in options for Queue');
  }

  EventEmitter.call(this);
  this.setMaxListeners(0);

  this.name = name;
  this.id = idgen();
  this.options = options;
  this.client = options.client;
  this.prefix = options.prefix || 'queue:';
  this.lockRenewTime = options.lockRenewTime || 5000;
}
util.inherits(Queue, EventEmitter);

Queue.prototype.key = function () {
  var args = Array.prototype.slice.call(arguments, 0);
  return this.prefix + [this.name].concat(args).join(':');
};

Queue.prototype.uniqueKey = function () {
  var args = Array.prototype.slice.call(arguments, 0);
  return this.prefix + [this.name, this.id].concat(args).join(':');
};

module.exports = Queue;
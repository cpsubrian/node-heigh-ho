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

  this.client.on('ready', function () {
    self.emit('ready');
  });
  this.client.on('error', function (err) {
    self.emit('error', err);
  });
}
util.inherits(Queue, EventEmitter);

Queue.prototype.close = function (cb) {
  if (this.client.connected) {
    if (cb) {
      this.client.on('end', cb);
    }
    this.client.quit();
  }
  else {
    if (cb) process.nextTick(cb);
  }
};

Queue.prototype.process = function (handler) {
  if (this.handler) throw new Error('Each queue may only have one processor');
  this.handler = handler;
};

Queue.prototype.key = function () {
  var args = Array.prototype.slice.call(arguments, 0);
  return this.prefix + [this.name].concat(args).join(':');
};

Queue.prototype.uniqueKey = function () {
  var args = Array.prototype.slice.call(arguments, 0);
  return this.prefix + [this.name, this.id].concat(args).join(':');
};

module.exports = Queue;
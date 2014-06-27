var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , idgen = require('idgen')
  , Job = require('./job');

/**
 * Queue Class
 *
 * @param {[type]} name    [description]
 * @param {[type]} options [description]
 */
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
    self._error(err);
  });
}
util.inherits(Queue, EventEmitter);

/**
 * Close a queue, quiting any open redis connections.
 *
 * @param  {Function} cb [description]
 * @return {[type]}      [description]
 */
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

/**
 * Set the handler for processing jobs in this queue.
 *
 * @param  {[type]} handler [description]
 * @return {[type]}         [description]
 */
Queue.prototype.process = function (handler) {
  if (this.handler) throw new Error('Each queue may only have one processor');
  this.handler = handler;
};

/**
 * Add a new job to the queue. Returns the instance of the Job.
 *
 * @param {[type]}   payload [description]
 * @param {Function} cb      [description]
 */
Queue.prototype.add = function (payload, cb) {
  var self = this
    , job;

  job = new Job(payload, self);

  job.on('error', function (err) {
    self._error(err, cb);
  });
  job.on('end', function (result) {
    if (cb) cb(null, result);
  });

  // Increment and fetch a new job id.
  self.client.INCR(self.key('jobs', 'id'), function (err, id) {
    if (err) return job.emit('error', err);
    job.id = id;
    job.save(function (err) {
      if (err) return;
      self.client.RPUSH(self.key('jobs', 'pending'), id, function (err) {
        if (err) return job.emit('error', err);
      });
    });
  });

  return job;
};

/**
 * Create a key from any number of parts. Includes the queue prefix and name.
 *
 * @return {[type]} [description]
 */
Queue.prototype.key = function () {
  var args = Array.prototype.slice.call(arguments, 0);
  return this.prefix + [this.name].concat(args).join(':');
};

/**
 * Create a process-specific key from any number of parts. Inlcudes the queue
 * prefix, the queue name, and the unique id for this process.
 *
 * @return {[type]} [description]
 */
Queue.prototype.uniqueKey = function () {
  var args = Array.prototype.slice.call(arguments, 0);
  return this.prefix + [this.name, this.id].concat(args).join(':');
};

/**
 * Return the state of the queue.
 */
Queue.prototype.toJSON = function () {
  return {
    prefix: this.prefix,
    name: this.name,
    id: this.id
  };
};

/**
 * Handle an error with an optional callback.
 */
Queue.prototype._error = function (err, cb) {
  this.emit('error', err);
  return !cb || cb(err);
};

module.exports = Queue;
var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , hydration = require('hydration');

/**
 * Job Class
 *
 * @param {[type]} payload [description]
 * @param {[type]} queue   [description]
 */
function Job (options) {
  this.id = options.id || null;
  this.payload = options.payload;
  this.queue = options.queue;
  this.client = options.queue.client;
  this.source = options.source || options.queue.toJSON();

  EventEmitter.call(this);
  this.setMaxListeners(0);
}
util.inherits(Job, EventEmitter);

/**
 * Create a job, saving it and adding it to the queue.
 */
Job.prototype.create = function () {
  var self = this;

  this.save(function (err) {
    if (err) return self.emit('error', err);

    // We're either adding this to the pending or paused lists, depending on
    // the state of the queue.
    var paused = self.queue.key('jobs', 'paused')
      , pending = self.queue.key('jobs', 'pending')
      , script = [
          "if redis.call('EXISTS', KEYS[1]) == 1 then",
          "  redis.call('SADD', KEYS[1], ARGV[1]);",
          "  return 'paused';",
          "else",
          "  redis.call('SADD', KEYS[2], ARGV[1]);",
          "  return 'pending';",
          "end"
        ].join("\n");

    self.client.EVAL(script, 2, paused, pending, self.id, function (err, status) {
      if (err) return self.emit('error', err);
      self.queue.pubClient.publish(self.queue.key(), self.id);
      self.emit('added', status);
    });
  });
};

/**
 * Save or update a job in redis.
 */
Job.prototype.save = function (cb) {
  var self = this;

  // Increment and fetch a new job id, if we need one.
  if (!this.id) {
    this.queue.client.INCR(this.queue.key('jobs', 'id'), function (err, id) {
      if (err) return self.emit('error', err);
      self.id = id;
      _save();
    });
  }
  else {
    _save();
  }

  function _save () {
    var key = self.queue.key('job', self.id);
    var data = JSON.stringify(hydration.dehydrate(self.toJSON()));
    self.queue.client.SET(key, data, cb);
  }
};

/**
 * Returns the raw data for this job.
 */
Job.prototype.toJSON = function () {
  return {
    id: this.id,
    source: this.source,
    payload: this.payload
  };
};


module.exports = Job;
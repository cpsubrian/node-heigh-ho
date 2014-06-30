var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , hydration = require('hydration')
  , idgen = require('idgen');

/**
 * Job Class
 *
 * @param {[type]} payload [description]
 * @param {[type]} queue   [description]
 */
function Job (options) {
  this.id = options.id || idgen();
  this.payload = options.payload;
  this.queue = options.queue;
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

    self.queue.client.EVAL(script, 2, paused, pending, self.id, function (err, status) {
      if (err) return self.emit('error', err);
      self.queue.publish(self.queue.key('job', 'create'), {id: self.id});
      self.emit('create', status);
    });
  });
};

/**
 * Save or update a job in redis.
 */
Job.prototype.save = function (cb) {
  var key = this.queue.key('job', this.id);
  var data = JSON.stringify(hydration.dehydrate(this.toJSON()));
  this.queue.client.SET(key, data, cb);
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
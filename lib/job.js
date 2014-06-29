var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , hydration = require('hydration');

/**
 * Job Class
 *
 * @param {[type]} payload [description]
 * @param {[type]} queue   [description]
 */
function Job (payload, queue) {
  this.payload = payload;
  this.queue = queue;

  EventEmitter.call(this);
  this.setMaxListeners(0);
}
util.inherits(Job, EventEmitter);

/**
 * Save or update a job in redis.
 */
Job.prototype.save = function (cb) {
  var self = this
    , key
    , data;

  // Increment and fetch a new job id.
  this.queue.client.INCR(this.queue.key('jobs', 'id'), function (err, id) {
    if (err) return self.emit('error', err);

    self.id = id;
    key = self.queue.key('job', self.id);
    data = JSON.stringify(hydration.dehydrate(self.toJSON()));

    self.queue.client.SET(key, data, cb);
  });
};

/**
 * Returns the raw data for this job.
 */
Job.prototype.toJSON = function () {
  return {
    id: this.id,
    source: this.queue.toJSON(),
    payload: this.payload
  };
};


module.exports = Job;
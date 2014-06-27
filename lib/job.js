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
  var key = this.queue.key('job', this.id)
    , data = JSON.stringify(hydration.dehydrate(this.toJSON()));

  this.queue.client.SET(key, data, cb);
};

/**
 * Returns the raw data for this job.
 */
Job.prototype.toJSON = function () {
  return {
    id: this.id,
    queue: this.queue.toJSON(),
    payload: this.payload
  };
};


module.exports = Job;
var EventEmitter = require('events').EventEmitter
  , util = require('util');

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
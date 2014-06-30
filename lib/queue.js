var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , idgen = require('idgen')
  , hydration = require('hydration')
  , redis = require('redis')
  , trycatch = require('trycatch')
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

  EventEmitter.call(this);
  this.setMaxListeners(0);

  this.name = name;
  this.id = idgen();
  this.prefix = options.prefix || 'queue:';
  this.options = options;

  // Active instances of jobs stored here.
  // @todo Hunt down memory leaks.
  this.jobs = {};

  // Create redis clients.
  this.setupClients();
}
util.inherits(Queue, EventEmitter);

/**
 * Setup redis clients.
 *
 * @todo support haredis.
 */
Queue.prototype.setupClients = function () {
  var options = this.options
    , self = this
    , latch = 3;

  function createClient () {
    var client = redis.createClient(options.port || 6379, options.host || 'localhost', options);
    client.on('error', function (err) {
      self._error(err);
    });
    client.on('ready', function () {
      if (--latch === 0) self.emit('ready');
    });
    return client;
  }

  this.client = createClient();
  this.subClient = createClient();
  this.pubClient = createClient();
};

/**
 * Close a queue, quiting any open redis connections.
 *
 * @param  {Function} cb [description]
 * @return {[type]}      [description]
 */
Queue.prototype.close = function (cb) {
  var self = this;

  function quit (client) {
    return function (done) {
      client.on('end', done);
      client.quit();
    };
  }

  if (this.client.connected) {
    this._do([
      quit(this.client),
      quit(this.subClient),
      quit(this.pubClient)
    ], function (err) {
      if (err) return self._error(err, cb);
      if (cb) cb();
    });
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
  this.run();
};

/**
 * Add a new job to the queue. Returns the instance of the Job.
 *
 * @param {[type]}   payload [description]
 * @param {Function} done      [description]
 */
Queue.prototype.add = function (payload, options) {
  var self = this
    , job;

  // Optional options are optional.
  options = options || {};

  // Create the job object and bubble errors up to the queue.
  job = new Job({payload: payload, queue: self});
  job.on('error', function (err) {
    self._error(err);
  });
  job.create();

  // Store the job instance for later event emitting.
  this.jobs[job.id] = job;

  return job;
};

/**
 * Load a job.
 */
Queue.prototype.load = function (jobId, cb) {
  var self = this;
  this.client.GET(this.key('job', jobId), function (err, data) {
    if (err) return self._error(err, cb);
    trycatch (function () {
      data = hydration.hydrate(JSON.parse(data));
      cb(null, new Job({
        id: data.id,
        payload: data.payload,
        source: data.source,
        queue: self
      }));
    }, function (err) {
      return self._error(err, cb);
    });
  });
};

/**
 * Count the number of jobs, filtered by status or statuses.
 */
Queue.prototype.count = function (status, cb) {
  var self = this;

  if (typeof status === 'function') {
    cb = status;
    status = null;
  }

  status = status || ['pending', 'active'];
  if (! Array.isArray(status)) {
    status = [status];
  }

  var multi = this.client.multi();
  status.forEach(function (val) {
    multi.SCARD(self.key('jobs', val));
  });

  multi.exec(function (err, results) {
    if (err) return self._error(err);
    cb(null, results.reduce(function (sum, val) { return sum + val; }, 0));
  });
};

/**
 * Empty the queue. (Only pending jobs are deleted).
 *
 * You can only be sure the queue is truely empty if no other processes are
 * running that could be adding new jobs simultaneously.
 *
 * @todo See if we can make this less naive, though I'm not sure what the
 * expected behavior should be.
 */
Queue.prototype.empty = function (cb) {
  var self = this
    , multi = this.client.multi();

  multi.SMEMBERS(this.key('jobs', 'pending'));
  multi.DEL(this.key('jobs', 'pending'));

  multi.exec(function (err, results) {
    if (err) return self._error(err, cb);
    if (!results[0].length) return cb();

    var multi = self.client.multi();
    results[0].forEach(function (id) {
      multi.DEL(self.key('job', id));
      if (self.jobs[id]) {
        self.jobs[id].emit('removed');
        delete self.jobs[id];
      }
    });

    multi.exec(function (err) {
      if (err) return self._error(err, cb);
      return !cb || cb();
    });
  });
};

/**
 * Get the current status of the queue.
 */
Queue.prototype.status = function (cb) {
  var self = this;
  this.client.GET(this.key('status'), function (err, current) {
    if (err) return self._error(err, cb);
    cb(null, current || 'active');
  });
};

/**
 * Pause the queue.
 */
Queue.prototype.pause = function (cb) {
  var self = this;

  this.client.GETSET(this.key('status'), 'paused', function (err, current) {
    if (err) return self._error(err, cb);
    if (current === 'paused') return !cb || cb();

    // Try to rename the 'pending' list to 'paused'. If this fails then the queue
    // is in some weird unknown state where there was a pause that was never
    // resumed.
    self.client.RENAMENX(self.key('jobs', 'pending'), self.key('jobs', 'paused'), function (err, result) {
      // If there is no pending key, then we just haven't added any jobs yet.
      if (err && err.message !== 'ERR no such key') {
        return self._error(err, cb);
      }
      return !cb || cb();
    });
  });
};

/**
 * Resume the queue.
 */
Queue.prototype.resume = function (cb) {
  var self = this;

  this.client.GETSET(this.key('status'), 'active', function (err, current) {
    if (err) return self._error(err, cb);
    if (current === 'active') return !cb || cb();

    // Try to rename the 'paused' list to 'pending'. If this fails then the queue
    // is in some weird unknown state.
    self.client.RENAMENX(self.key('jobs', 'paused'), self.key('jobs', 'pending'), function (err, result) {
      if (err && err.message !== 'ERR no such key') {
        return self._error(err, cb);
      }
      return !cb || cb();
    });
  });
};

/**
 * Run the queue.
 */
Queue.prototype.run = function () {
  var self = this;

  // Listen for published messages.
  this.subClient.on('message', this._onMessage.bind(this));

  // Setup subscriptions.
  this.subscribe(this.key('job', 'create'));
  this.subscribe(this.key('job', 'complete'));
  this.subscribe(this.key('job', 'fail'));

  // Check if there are 'stale' pending items in the queue.
  this.client.SMEMBERS(this.key('jobs', 'pending'), function (err, jobs) {
    if (err) return self._error(err);
    jobs.forEach(function (jobId) {
      self.publish(self.key('job', 'create'), {id: jobId});
    });
  });
};

/**
 * Subscribe to a channel.
 */
Queue.prototype.subscribe = function (channel) {
  this.subClient.subscribe(channel);
};

/**
 * Publish a message to a channel.
 */
Queue.prototype.publish = function (channel, data) {
  var message = JSON.stringify(hydration.dehydrate(data));
  this.pubClient.publish(channel, message);
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

/**
 * Handle published messages.
 */
Queue.prototype._onMessage = function (channel, message) {
  // All messages will be hydrated objects.
  var data;
  try { data = hydration.hydrate(JSON.parse(message)); }
  catch (e) { return this._error(e); }

  // A job was added to the queue, lets try to proccess it.
  if (channel === this.key('job', 'create')) {
    this._processJob(data);
  }

  // A job was completed.
  if (channel === this.key('job', 'complete')) {
    this._jobComplete(data);
  }

  // A job failed.
  if (channel === this.key('job', 'fail')) {
    this._jobFail(data);
  }
};

/**
 * Process a job.
 */
Queue.prototype._processJob = function (data) {
  var self = this
    , pending = this.key('jobs', 'pending')
    , active = this.key('jobs', 'active')
    , complete = this.key('jobs', 'complete');


  // Helper to handle job failures.
  function fail (err, job) {
    self.publish(self.key('job', 'fail'), {id: job.id, error: err.message});
    self._error(error);
  }

  // Atomically move the job from pending to active.
  this.client.SMOVE(pending, active, data.id, function (err, moved) {
    if (err) return self._error(err);
    if (moved !== 1) return;
    self.load(data.id, function (err, job) {
      if (err) return self._error(err);
      trycatch(function () {
        self.handler(job, function (err, result) {
          if (err) return fail(err, job);
          self.client.SMOVE(active, complete, job.id, function (err, moved) {
            if (err) return fail(err, job);
            if (moved !== 1) {
              var error = new Error('Could not move processed job from active to complete');
              error.job = job;
              return fail(job, error);
            }
            self.publish(self.key('job', 'complete'), {id: job.id, result: result});
          });
        });
      }, function (err) {
        fail(err, job);
      });
    });
  });
};

/**
 * A job was completed.
 */
Queue.prototype._jobComplete = function (data) {
  // Cleanup job instance and emit complete event.
  if (this.jobs[data.id]) {
    this.jobs[data.id].emit('complete', data.result);
    delete this.jobs[data.id];
  }
};

/**
 * A job failed.
 */
Queue.prototype._jobFail = function (data) {
  // Cleanup job instance and emit fail event.
  if (this.jobs[data.id]) {
    this.jobs[data.id].emit('fail', data.error);
    delete this.jobs[data.id];
  }
};

/**
 * Some simple flow control for parallel stuff.
 */
Queue.prototype._do = function (funcs, cb) {
  var latch = funcs.length;
  function done (err) {
    if (err) {
      latch = -1;
      return cb(err);
    }
    if (--latch === 0) {
      cb();
    }
  }
  funcs.forEach(function (func) {
    func(done);
  });
};

module.exports = Queue;
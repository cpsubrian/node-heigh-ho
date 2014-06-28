var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , idgen = require('idgen')
  , hydration = require('hydration')
  , redis = require('redis')
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
  this.options = options;
  this.prefix = options.prefix || 'queue:';
  this.lockRenewTime = options.lockRenewTime || 5000;

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

  // Create the job object and bind events.
  job = new Job(payload, self);
  job.on('error', function (err) {
    self._error(err);
  });
  job.save(function (err) {
    if (err) return job.emit('error', err);

    // We're either adding this to the pending or paused lists, depending on
    // the state of the server.
    var paused = self.key('jobs', 'paused')
      , pending = self.key('jobs', 'pending')
      , script = " if redis.call('EXISTS', KEYS[1]) == 1 then" +
                 "   redis.call('RPUSH', KEYS[1], ARGV[1]);" +
                 "   return 'paused';" +
                 " else" +
                 "   redis.call('RPUSH', KEYS[2], ARGV[1]);" +
                 "   return 'pending';" +
                 " end";

    self.client.EVAL(script, 2, paused, pending, job.id, function (err, status) {
      if (err) return job.emit('error', err);
      job.emit('added', status);
    });
  });

  return job;
};

/**
 * Load a job.
 */
Queue.prototype.load = function (jobId, cb) {
  this.client.GET(this.key('job', jobId), function (err, data) {
    if (err) return self._error(err, cb);
    try {
      var job = hydration.hydrate(JSON.parse(data));
      cb(null, job);
    }
    catch (e) {
      return self._error(e, cb);
    }
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
    multi.LLEN(self.key('jobs', val));
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

  multi.LRANGE(this.key('jobs', 'pending'), 0, -1);
  multi.DEL(this.key('jobs', 'pending'));

  multi.exec(function (err, results) {
    if (err) return self._error(err, cb);
    if (!results[0].length) return cb();

    var multi = self.client.multi();
    results[0].forEach(function (id) {
      // @todo Should probably delete via a Job class method, and emit some
      // event that instances can listen for.
      multi.DEL(self.key('job', id));
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
  // Setup process pub/sub handlers.
  this._startProcessing();

  // Check if there are 'stale' pending items in the queue and do something
  // with them.
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
 * Start processing items.
 */
Queue.prototype._startProcessing = function () {
  var self = this;

  // Subscribe to queue.
  this.subClient.on('message', this._onMessage.bind(this));
  this.subClient.subscribe(this.key());

  // Make sure 'stale' items are getting processed.
  this.client.LRANGE(this.key('jobs', 'pending'), 0, -1, function (err, ids) {
    if (err) return self._error(err);
    console.log(ids);
  });
};

/**
 * Handle published messages.
 */
Queue.prototype._onMessage = function (channel, message) {
  console.log(channel, message);
};

/**
 * Process a job.
 */
Queue.prototype._processJob = function (jobId, cb) {

};

/**
 * Some simple flow control for parallel stuff. Treat callback as optional.
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


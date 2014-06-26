var Queue = require('./lib/queue')
  , Job = require('./lib/job')
  , _ = require('lodash');


module.exports = function (name, defaults) {
  if (typeof name === 'undefined' && typeof defaults === 'undefined') {
    throw new Error('missing name or options for heigh-ho factory');
  }
  if (typeof name !== 'string' && typeof defaults === 'undefined') {
    defaults = name;
    name = null;
  }
  if (typeof name === 'string') {
    defaults = defaults || {};
    return new Queue(name, defaults);
  }
  else {
    return function (name, options) {
      return module.exports(name, _.extend({}, defaults, options || {}));
    };
  }
};

module.exports.Queue = Queue;
module.exports.Job = Job;
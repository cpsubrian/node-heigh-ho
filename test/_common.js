heighho = require('../');
assert = require('assert');
util = require('util');
redis = require('redis');
idgen = require('idgen');
exec = require('child_process').exec;

createTestQueue = function (done) {
  var queue = heighho(idgen(), {
    client: redis.createClient(),
    prefix: 'heigh-ho-test'
  });
  queue.on('ready', done);
  return queue;
};

destroyTestQueue = function (queue, done) {
  exec('redis-cli keys "' + queue.key('*') + '" | xargs redis-cli del', function (err, stdout, stderr) {
    if (err) return done(err);
    queue.close(done);
  });
};
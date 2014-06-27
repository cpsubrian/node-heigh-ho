heighho = require('../');
assert = require('assert');
util = require('util');
redis = require('redis');
idgen = require('idgen');

createTestQueue = function (done) {
  var queue = heighho(idgen(), {
    client: redis.createClient(),
    prefix: 'heigh-ho-test'
  });

  queue.on('ready', done);

  return queue;
};

destroyTestQueue = function (queue, done) {
  queue.client.keys(queue.key('*'), function (err, keys) {
    if (err) return done(err);
    queue.client.del(keys, function (err) {
      if (err) return done(err);
      queue.close(done);
    });
  });
};
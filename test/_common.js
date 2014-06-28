heighho = require('../');
assert = require('assert');
async = require('async');

var idgen = require('idgen');
var exec = require('child_process').exec;

createTestQueue = function (done) {
  var queue = heighho(idgen(), {
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
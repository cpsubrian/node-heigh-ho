var redis = require('redis');

describe('Queue', function () {

  describe('instantiation', function () {
    it('requires at a name', function () {
      assert.throws(function () {
        heighho();
      }, /missing name or options/);
      assert.throws(function () {
        heighho('');
      }, /missing or empty name/);
    });

    it('requires a redis client', function () {
      assert.throws(function () {
        heighho('test');
      }, /missing redis client/);
    });

    it('checks for redis client from factory', function () {
      var factory = heighho({});
      assert.throws(function () {
        factory('test');
      }, /missing redis client/);
    });

    it('can create a queue', function () {
      var queue = heighho('test', {client: redis.createClient(), a: 'queue'});
      assert.equal(queue.options.a, 'queue');
    });

    it('can create queues from a factory', function () {
      var factory = heighho({client: redis.createClient(), a: 'factory', b: 'factory'});
      var queue = factory('test', {b: 'queue'});
      assert.equal(queue.options.a, 'factory');
      assert.equal(queue.options.b, 'queue');
    });
  });

  describe('methods', function () {
    var queue;

    beforeEach(function () {
      queue = heighho('test', {client: redis.createClient()});
    });

    it('can generate keys', function () {
      var key = queue.key('a', 'b', 'c');
      assert.equal(key, queue.prefix + [queue.name, 'a', 'b', 'c'].join(':'));
    });

    it('can generate unique keys', function () {
      var key = queue.uniqueKey('a', 'b', 'c');
      assert.equal(key, queue.prefix + [queue.name, queue.id, 'a', 'b', 'c'].join(':'));
    });
  });

});
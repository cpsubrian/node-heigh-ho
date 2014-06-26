describe('Queue', function () {

  it('requires at least a name', function () {
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

  it('can create queues from a factory', function () {
    var factory = heighho({client: true, a: 'factory', b: 'factory'});
    var queue = factory('test', {b: 'queue'});
    assert.equal(queue.options.a, 'factory');
    assert.equal(queue.options.b, 'queue');
  });
});
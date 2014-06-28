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

    beforeEach(function (done) {
      queue = createTestQueue(done);
    });
    afterEach(function (done) {
      destroyTestQueue(queue, done);
    });

    it('can generate keys', function () {
      var key = queue.key('a', 'b', 'c');
      assert.equal(key, queue.prefix + [queue.name, 'a', 'b', 'c'].join(':'));
    });

    it('can generate unique keys', function () {
      var key = queue.uniqueKey('a', 'b', 'c');
      assert.equal(key, queue.prefix + [queue.name, queue.id, 'a', 'b', 'c'].join(':'));
    });

    it('can close a queue', function (done) {
      assert(queue.client.connected);
      queue.close(function () {
        assert(queue.client.connected === false);
        done();
      });
    });

    it('cannot provide more than one processing handler', function () {
      queue.process(function () {});
      assert.throws(function () {
        queue.process(function () {});
      }, /one processor/);
    });

    it('toJSON() returns the queue properties');
  });

  describe('processing', function () {
    var queue, job;

    beforeEach(function (done) {
      queue = createTestQueue(done);
    });
    afterEach(function (done) {
      destroyTestQueue(queue, done);
    });

    it('can create and load a job', function (done) {
      job = queue.add('job1');
      job.on('added', function (status) {
        assert.equal(status, 'pending');
        assert(typeof job.id !== 'undefined');
        queue.load(job.id, function (err, loaded) {
          assert.ifError(err);
          assert.equal(loaded.id, job.id);
          done();
        });
      });
    });

    it('can count the number of pending jobs', function (done) {
      job = queue.add('job1');
      job = queue.add('job2');
      job = queue.add('job3');
      job.on('added', function () {
        queue.count(function (err, count) {
          assert.ifError(err);
          assert.equal(count, 3);
          done();
        });
      });
    });

    it('can empty the queue', function (done) {
      job = queue.add('job1');
      job = queue.add('job2');
      job = queue.add('job3');
      job.on('added', function (status) {
        queue.empty(function (err) {
          assert.ifError(err);
          queue.count(function (err, count) {
            assert.ifError(err);
            assert.equal(count, 0);
            done();
          });
        });
      });
    });

    it('can get the status of the queue', function (done) {
      queue.status(function (err, status) {
        assert.ifError(err);
        assert.equal(status, 'active');
        done();
      });
    });

    it('can pause and resume the queue', function (done) {
      async.series([
        // Add some items.
        function (next) {
          job = queue.add('job1');
          job = queue.add('job2');
          job = queue.add('job3');
          job.on('added', function (status) {
            assert.equal(status, 'pending');
            next();
          });
        },
        // Pause it.
        function (next) {
          queue.pause(next);
        },
        // Count pending items.
        function (next) {
          queue.count('pending', function (err, count) {
            if (err) return next(err);
            assert.equal(count, 0);
            next();
          });
        },
        // Count paused items.
        function (next) {
          queue.count('paused', function (err, count) {
            if (err) return next(err);
            assert.equal(count, 3);
            queue.status(function (err, status) {
              assert.ifError(err);
              assert.equal(status, 'paused');
              next();
            });
          });
        },
        // Make sure redundantly calling pause doesn't cause any problems.
        function (next) {
          queue.pause(next);
        },
        // Make sure new items get paused.
        function (next) {
          job = queue.add('job4');
          job.on('added', function (status) {
            assert.equal(status, 'paused');
            queue.count('pending', function (err, count) {
              assert.ifError(err);
              assert.equal(count, 0);
              queue.count('paused', function (err, count) {
                assert.ifError(err);
                assert.equal(count, 4);
                next();
              });
            });
          });
        },
        // Resume the quque.
        function (next) {
          queue.resume(next);
        },
        // Count pending items.
        function (next) {
          queue.count('paused', function (err, count) {
            assert.ifError(err);
            assert.equal(count, 0);
            queue.count('pending', function (err, count) {
              assert.ifError(err);
              assert.equal(count, 4);
              next();
            });
          });
        },
        // Make sure new items get added to pending.
        function (next) {
          job = queue.add('job6');
          job.on('added', function (status) {
            assert.equal(status, 'pending');
            queue.count('paused', function (err, count) {
              assert.ifError(err);
              assert.equal(count, 0);
              queue.count('pending', function (err, count) {
                assert.ifError(err);
                assert.equal(count, 5);
                next();
              });
            });
          });
        },
      ], function (err) {
        assert.ifError(err);
        done();
      });
    });

  });
});

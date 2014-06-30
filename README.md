Heigh Ho!
=========

A redis-backed message/job queue. Originally inspired by `bull`.

[![build status](https://secure.travis-ci.org/cpsubrian/node-heigh-ho.png)](http://travis-ci.org/cpsubrian/node-heigh-ho)

![Hard Working Little People](https://camo.githubusercontent.com/dfda20e32d2bf70ff3e8070239c46e7b9101fad1/687474703a2f2f7777772e77616765686f7572696e7369676874732e636f6d2f4865696768253230486f2e6a7067)

Status: WIP
-----------

Todo:

- Rethink events and API for jobs:
  - Should we just emit 'error', 'end', and 'change' events and attach
    more specific metadata? ('failed', 'complete', 'paused', results, etc.)
  - We currently have some inconsistency of when you MUST provide a callback, when
    its optional, and when only events are supported. Need to make sure the
    API feels natural.
- For inter-process communication RE event complete/fail, need to implement
  an acknowlegement system so pub/sub messages that get dropped are accounted
  for.
- Better tests for job errors & failures. Make sure items are removed from the
  queue and that the owning queue process gets a chance to handle the failure.
- Attempt to write tests that simulate conditions where race conditions
  could occur (multi-process with queue contention).
- Write benchmarks so we have a rough idea of baseline concurrency (and
  possibly investigate speed improvements).
- How to support `haredis`?

- - -

Features
--------

- Full support for multi-process queue workers, creators.
  - Includes pub/sub-backed job notifications and resolution of job events
    (error/complete/changes) to their originating processes.
- Job handlers can send arbitrary 'results' back to the origin of the job. This
  allows for a sort of RPC, where you can offload the work but still respond
  to the result or any status changes (such as rendering a progress bar).

Example
-------

The basic usage example below should get you started.

```js
// Create a queue.
var heighho = require('heigh-ho')
  , queue = heighho('my:job:name', {
      host: 'localhost', // default
      port: 6379, // default
    });

// Process a job.
queue.process(function (job, done) {
  // Do something more interesting than this.
  setTimeout(function () {
    // Call when you're done.
    done();

    // Send a result back to the enqueuer (only if they're listening for it).
    done(null, {results: 'are support'});

    // Call if there's an error.
    done(new Error('Some error happened'));

    // Thrown errors are handled too.
    throw new Error('Some unhandled error happened');
  }, 1000);
});

// Enqueue a job.
queue.add({my: 'data'});

// Enqueue a job and respond to errors or results.
var job = queue.add({more: 'dataz'});
job.on('error', function (err) {
  // There was an internal error with the job.
});
job.on('fail', function (err) {
  // The job failed to process.
});
job.on('complete', function (result) {
  // Do something with the result.
});
```

Alternatively, if you want to create several queues from a set of default options.

```js
// Create the queues.
var queue = require('heigh-ho')(/* using defaults */)
  , videos = queue('videos')
  , images = queue('images');

// Process stuff.
videos.process(function (job, done) {
  done();
})
images.process(function (job, done) {
  done();
});

// Endqueue some jobs.
videos.add({url: 'http://www.youtube.com/blahblah'});
images.add({url: '../images/polar-bear.png'});
```

API
---

@todo


- - -

#### Developed by [TerraEclipse](https://github.com/TerraEclipse)

Terra Eclipse, Inc. is a nationally recognized political technology and
strategy firm located in Santa Cruz, CA and Washington, D.C.

- - -

#### License: BSD
Copyright (C) 2014 Terra Eclipse, Inc. ([http://www.terraeclipse.com](http://www.terraeclipse.com))
Copyright (C) 2014 Brian Link
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.

2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.

3. Neither the name of Terra Eclipse, Inc. nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
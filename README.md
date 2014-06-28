Heigh Ho!
=========

A redis-backed message/job queue. API inspired by `bull`.

[![build status](https://secure.travis-ci.org/cpsubrian/node-heigh-ho.png)](http://travis-ci.org/cpsubrian/node-heigh-ho)

![Hard Working Little People](https://camo.githubusercontent.com/dfda20e32d2bf70ff3e8070239c46e7b9101fad1/687474703a2f2f7777772e77616765686f7572696e7369676874732e636f6d2f4865696768253230486f2e6a7067)

Example
-------

The basic usage example below should get you started.

```js
// Create a queue.
var heighho = require('heigh-ho')
  , redisClient = require('haredis').createClient()
  , queue = heighho('my:job:name', {client: redisClient});

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
queue.add({more: 'dataz'}, function (err, result) {

});
```

Alternatively, if you want to create several queues from a set of default options.

```js
// Create the queues.
var heighho = require('heigh-ho')
  , redis = require('redis').createClient()
  , queue = heighho({client: redis})
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
test:
	@./node_modules/.bin/mocha \
		--reporter spec \
		--bail \
		--timeout 5s \
		--require test/_common.js

clean:
	redis-cli keys "heigh-ho:test:*" | xargs redis-cli del

.PHONY: test
.PHONY: clean
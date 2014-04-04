#! /bin/bash -eu

. config/env.sh
exec node --trace_gc --max_new_space_size=32768 --max_old_space_size=128 server.js
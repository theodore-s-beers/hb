# Extremely simple heartbeat monitoring for servers

- Are you tired of users asking if such-and-such server is up?
- Are some of your servers behind a firewall?
- Would you like to be able to point people to a publicly accessible URL that
  simply reports the timestamp at which each server was last confirmed up?

If you answered "yes" to these questions, then you're in luck. You can set up an
endpoint with [Cloudflare Workers](https://workers.cloudflare.com/), where a
server can send a POST request—using HTTP Basic Auth to keep riffraff away—and
have the timestamp of that request saved in a **Cloudflare KV** namespace. A GET
request to the same endpoint (no auth needed) will return a JSON object mapping
the short hostname of each server to the timestamp of its last successful POST.
Responses will look something like the following:

```json
{
  "foo": "2025-05-03T16:05:01.290Z (2 minutes ago)",
  "bar": "2025-05-03T16:05:01.637Z (2 minutes ago)",
  "baz": "2025-05-03T16:05:01.569Z (2 minutes ago)"
}
```

**With a reasonable number of servers sending POST requests at reasonable
intervals, you can probably run this service within the limits of the free tier
of Cloudflare Workers.**

## Steps

1. Create a new Cloudflare KV namespace. The name is arbitrary—say,
   `heartbeats`.

2. Create a new Cloudflare Worker, starting with the code in `worker.js` in this
   repository and adapting it to your needs.

3. In the worker settings, add a binding to the KV namespace that you created in
   step 1. The name you choose here is again arbitrary, but it must match the
   name that you use in the worker script. As you can see, the code in
   `worker.js` uses the name `HEARTBEATS`, accessed via `env.HEARTBEATS`.

4. Also in the worker settings, add environment secrets for `BASIC_AUTH_USER`
   and `BASIC_AUTH_PASS` (or whatever names you prefer, updating the code to
   match).

5. At this point, you can already deploy the worker and test a GET request. It
   should 404 with the message "No heartbeats found." Then you can try a POST,
   perhaps using a `curl` command like the following:

   ```sh
   curl -X POST "https://PROJECT.DOMAIN.workers.dev/?hostname=$(hostname -s)" \
     -u 'USER:PASS'
   ```

   Once you have successfully sent a POST request, try another GET.

6. The final step is to automate the sending of these POSTs from your servers.
   Put the `curl` command in a shell script; save it as e.g.
   `/usr/local/bin/heartbeat.sh`; and have it run every X minutes as a cron job.
   If you use a 15-minute interval, then each server will contribute 96 writes
   to the KV namespace per day. At the time of writing this readme, the free
   tier of Cloudflare Workers allows 1,000 KV writes per day (and 100,000 reads
   per day, which should hardly be a concern). So you could easily run
   monitoring for several servers without any expense.

Once everything is up and running, just tell users to visit
`https://PROJECT.DOMAIN.workers.dev/`. You could also inform them of the
interval, so they'll know to interpret any significantly older timestamp as an
indication of downtime.

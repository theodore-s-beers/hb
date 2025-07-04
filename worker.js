export default {
  async fetch(req, env) {
    if (req.method === "POST") {
      if (!checkAuth(req, env)) {
        return new Response("Unauthorized\n", {
          status: 401,
          headers: { "WWW-Authenticate": 'Basic realm="hb"' },
        });
      }

      const url = new URL(req.url);
      const hostname = url.searchParams.get("hostname");
      if (!hostname) return new Response("Missing hostname\n", { status: 400 });

      const timestamp = new Date().toISOString();

      try {
        await env.HEARTBEATS.put(hostname, timestamp);
        await env.DB.prepare(
          "INSERT INTO pings (host, timestamp) VALUES (?1, ?2)",
        )
          .bind(hostname, timestamp)
          .run();

        return new Response("Heartbeat recorded\n");
      } catch {
        return new Response("Internal server error\n", { status: 500 });
      }
    }

    if (req.method === "GET") {
      const url = new URL(req.url);

      if (url.pathname === "/history") {
        const host = url.searchParams.get("host");
        if (!host) {
          return new Response("Missing host\n", { status: 400 });
        }

        try {
          const { results } = await env.DB.prepare(
            "SELECT timestamp FROM pings WHERE host = ? ORDER BY timestamp DESC",
          )
            .bind(host)
            .all();

          if (!results || results.length === 0) {
            return new Response("No history found for the specified host\n", {
              status: 404,
            });
          }

          const timestamps = results.map((r) => r.timestamp);

          return new Response(JSON.stringify(timestamps, null, 2), {
            headers: { "Content-Type": "application/json" },
          });
        } catch {
          return new Response("Internal server error\n", { status: 500 });
        }
      }

      // GET request to any other path defaults to heartbeat list

      try {
        const hbList = await env.HEARTBEATS.list();
        if (!hbList || !hbList.keys || hbList.keys.length === 0) {
          return new Response("No heartbeats found\n", { status: 404 });
        }

        const results = {};

        for (const entry of hbList.keys) {
          const timestamp = await env.HEARTBEATS.get(entry.name);
          if (!timestamp) continue;

          const then = Date.parse(timestamp);
          const now = Date.now();
          const diffMinutes = Math.floor((now - then) / 60000);
          const unit = diffMinutes === 1 ? "minute" : "minutes";

          results[entry.name] = `${timestamp} (${diffMinutes} ${unit} ago)`;
        }

        if (Object.keys(results).length === 0) {
          return new Response("No heartbeats found\n", { status: 404 });
        }

        return new Response(JSON.stringify(results, null, 2), {
          headers: { "Content-Type": "application/json" },
        });
      } catch {
        return new Response("Internal server error\n", { status: 500 });
      }
    }

    return new Response("Invalid method\n", {
      status: 405,
      headers: { Allow: "GET, POST" },
    });
  },
};

function checkAuth(request, env) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return false;
  }

  const base64 = authHeader.slice("Basic ".length);
  const [user, pass] = atob(base64).split(":");
  if (!user || !pass) return false; // Empty user/pass always fails

  return user === env.BASIC_AUTH_USER && pass === env.BASIC_AUTH_PASS;
}

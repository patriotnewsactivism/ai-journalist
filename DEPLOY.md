# Deploying AI Journalist Studio on the Contabo box

Next.js 14 (pages router). Stateless — no database. Runs as its own container on
`apex-contabo_apexnet`, reached by Caddy as `ai-journalist:3000`.

## 1. Keys

`.env.local` in the repo root (never committed). Required:

```
GROQ_API_KEY=
DEEPGRAM_API_KEY=
ELEVENLABS_API_KEY=
GEMINI_API_KEY=            # document/context extraction
NEXT_PUBLIC_DID_CLIENT_KEY=   # optional, D-ID video journalist
NEXT_PUBLIC_DID_AGENT_ID=     # optional
```

The two `NEXT_PUBLIC_*` values are inlined into the browser bundle at build time,
so changing them requires a rebuild, not just a restart.

## 2. Build and run

```
cd /home/hermes/ai-journalist
sudo docker compose up -d --build
```

Do NOT add a `ports:` mapping. Caddy resolves `ai-journalist` over
`apex-contabo_apexnet`; publishing 3001 does nothing useful and just exposes the
app directly to the internet.

## 3. Caddy

Exactly one block, added to the Caddyfile that is bind-mounted into
`apex-contabo-caddy-1`:

```
ai-journalist.wtpnews.org {
	encode zstd gzip
	reverse_proxy ai-journalist:3000
}
```

Validate BEFORE reloading — a duplicate site block or two `reverse_proxy`
directives in one block makes Caddy reject the file, and if the old config is
still loaded you will be debugging the wrong thing:

```
sudo docker exec apex-contabo-caddy-1 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo docker exec apex-contabo-caddy-1 caddy reload  --config /etc/caddy/Caddyfile --adapter caddyfile
```

## 4. DNS

`ai-journalist.wtpnews.org` needs an A record pointing at `144.126.142.194`
before Caddy can obtain a certificate. Until that record exists the site cannot
resolve, no matter what the container and Caddyfile say.

## 5. Verify

```
sudo docker logs --tail 30 ai-journalist
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3000/     # from the host only if ports are published; otherwise:
sudo docker exec ai-journalist wget -qO- http://127.0.0.1:3000/ | head -c 200
sudo docker exec apex-contabo-caddy-1 wget -qO- http://ai-journalist:3000/ | head -c 200
```

A `200` from inside Caddy plus a working DNS record means the public URL is live.

# Production deployment

Production uses immutable API and web image digests from GHCR. The server does not build the
repository and does not need Node.js or pnpm.

## GitHub repository settings

Create these repository variables in `Settings → Secrets and variables → Actions → Variables`:

- `NEXT_PUBLIC_API_BASE_URL` — public API URL, for example `https://api.kodpauza.ru`;
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY` — public production Turnstile site key;
- `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` — optional Google Search Console HTML tag value;
- `NEXT_PUBLIC_YANDEX_SITE_VERIFICATION` — optional Yandex Webmaster HTML tag value;
- `NEXT_PUBLIC_BING_SITE_VERIFICATION` — optional Bing Webmaster Tools HTML tag value;
- `PROD_SSH_PORT` — SSH port, usually `22`;
- `ENABLE_PRODUCTION_DEPLOY` — keep `false` until the server is ready, then set `true`.

Create a protected GitHub Environment named `production` and add these environment secrets:

- `PROD_HOST` — server hostname or IP;
- `PROD_USER` — non-root deploy user;
- `PROD_SSH_PRIVATE_KEY` — dedicated private Ed25519 key for Actions;
- `PROD_SSH_KNOWN_HOSTS` — pinned server host-key line from a trusted source.

Create the dedicated key locally. Do not reuse a personal SSH key:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/kodpauza_github_actions -C kodpauza-github-actions
```

Install `~/.ssh/kodpauza_github_actions.pub` in the deploy user's
`~/.ssh/authorized_keys`. Put the complete contents of the private file
`~/.ssh/kodpauza_github_actions` into `PROD_SSH_PRIVATE_KEY`.

Obtain the server host key, verify its fingerprint through a trusted channel, then put the resulting
line into `PROD_SSH_KNOWN_HOSTS`:

```bash
ssh-keyscan -H -p 22 SERVER_HOST
```

Publishing to GHCR uses the built-in `GITHUB_TOKEN`; no registry write token is required in GitHub.
Protect `main` and require the `Quality and tests` check before merge. You can also require manual
approval on the `production` Environment if deployments must not start immediately after merge.

## Server prerequisites

- Linux x86_64;
- Docker Engine with the Compose plugin;
- curl;
- a non-root deploy user that can run Docker;
- nginx or Caddy terminating HTTPS in front of `127.0.0.1:3000` and `127.0.0.1:4000`.

An nginx HTTP bootstrap configuration for `kodpauza.ru` and `api.kodpauza.ru` is included as
`deploy/nginx.kodpauza.conf`. Install it in `/etc/nginx/sites-available/kodpauza`, enable it, then
obtain certificates with Certbot after both DNS names resolve to the production server.

Create the deployment directory once:

```bash
sudo install -d -o DEPLOY_USER -g DEPLOY_USER /opt/kodpauza
```

Install the public half of the dedicated Actions SSH key into the deploy user's
`~/.ssh/authorized_keys`. Add the deploy user to the Docker group or configure equivalent rootless
Docker access. Verify that this user can run `docker compose version` without `sudo`.

From the repository, upload the example runtime environment, replace every placeholder on the
server and restrict access:

```bash
scp -P 22 deploy/.env.production.example DEPLOY_USER@SERVER_HOST:/opt/kodpauza/.env.production
ssh -p 22 DEPLOY_USER@SERVER_HOST
nano /opt/kodpauza/.env.production
chmod 600 /opt/kodpauza/.env.production
```

Generate `JWT_SECRET`, `IP_HASH_SECRET` and `KODPAUZA_EMAIL_VERIFICATION_SECRET` independently with
`openssl rand -hex 32`. `POSTGRES_PASSWORD` and the password inside `DATABASE_URL` must match; URL
encode the password when it contains URL-reserved characters.

If GHCR packages remain private, log in once as the deploy user with a classic PAT that has only
`read:packages`:

```bash
docker login ghcr.io -u GITHUB_USERNAME
```

The production web URL and Turnstile site key are baked into the web image. Changing either
repository variable requires a new workflow build; changing `.env.production` only affects the API
and PostgreSQL runtime.

GitHub Actions uploads `compose.production.yml` and exact image digests, runs the migration service,
starts the stack and checks both health endpoints. The previous image references are kept in
`/opt/kodpauza/release.previous.env`, and the previous Compose file is kept in
`/opt/kodpauza/compose.previous.yml`.

## Manual status and rollback

```bash
cd /opt/kodpauza
docker compose --env-file .env.production --env-file release.env \
  -f compose.production.yml ps
```

Rollback to the previous images:

```bash
cd /opt/kodpauza
cp release.previous.env release.env
test ! -f compose.previous.yml || cp compose.previous.yml compose.production.yml
docker compose --env-file .env.production --env-file release.env \
  -f compose.production.yml pull
docker compose --env-file .env.production --env-file release.env \
  -f compose.production.yml up -d --remove-orphans
```

The PostgreSQL volume is not removed during deployments or rollback.

## Search engine indexing

The web image exposes canonical metadata, `robots.txt`, `sitemap.xml`, structured data and a web
manifest. After every successful production deployment the workflow also submits all public URLs to
IndexNow. The IndexNow key is public by design and is verified through the matching file in the web
root.

After the first SEO-enabled deployment:

1. Add the URL-prefix property `https://kodpauza.ru` to Google Search Console and add the same site
   to Yandex Webmaster.
2. Copy each service's HTML tag verification value into the corresponding GitHub repository
   variable above, rebuild the web image, then complete verification.
3. Submit `https://kodpauza.ru/sitemap.xml` in both webmaster panels.
4. Request indexing for `/`, `/for-developers`, `/for-advertisers` and `/install` once. IndexNow will
   handle subsequent deployment notifications for participating search engines.

Verification values are baked into the web image. Changing them requires a new workflow build.

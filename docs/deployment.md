# Deployment

GitHub Actions is the canonical deployment path. Local Wrangler deployment commands remain available for diagnostics and emergency use.

## Pipelines

- **Quality** runs `npm run check` on every pull request. It has no deployment environment or Cloudflare credentials.
- **Deploy development** runs on every push or merge to `main`, or when manually dispatched from any selected branch containing the workflow. It runs the checks, applies pending development D1 migrations, and deploys `env.dev`.
- **Deploy production** is manually triggered from `main`. It runs the checks, applies pending production D1 migrations, and deploys `env.prod` behind the `prod` environment approval gate.
- GitHub serializes deployments per environment so two migrations or deployments cannot run concurrently.

D1 records applied migrations, so rerunning either deployment workflow is safe when no new migration exists. A failed migration stops the workflow before the Worker deployment.

## GitHub configuration

The repository-level `CLOUDFLARE_ACCOUNT_ID` Actions secret is already configured. Before enabling deployments, add:

- `CLOUDFLARE_API_TOKEN`: create it from Cloudflare's **Edit Cloudflare Workers** API-token template, scope it only to the Ċomba account, and store it under **Settings → Secrets and variables → Actions**.

The token must not be committed to this repository. Slack signing and bot secrets remain encrypted Worker secrets in Cloudflare and are not copied into GitHub.

The repository uses two GitHub environments:

- `dev` accepts automatic deployments from `main` and manual deployments from any branch. A branch deployment replaces the shared development Worker and migrates the shared development D1 database.
- `prod` restricts deployment to `main` and provides a manual approval gate in addition to the workflow's manual trigger.

## Production deployment

Once production variables, Worker secrets, and the Slack app are configured:

1. Open **Actions → Deploy production**.
2. Select **Run workflow** from `main`.
3. Approve the `prod` environment deployment when prompted.
4. Verify the workflow's migration and deployment steps, then run the Slack smoke test from [`slack-setup.md`](./slack-setup.md).

## Local fallback

Authenticated maintainers can still deploy from a local checkout:

```bash
npm run db:migrate:dev
npm run deploy:dev
```

For production, run the equivalent `:prod` commands only when the GitHub Actions path is unavailable and record why the fallback was necessary.

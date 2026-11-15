# The book job on Cloud Run (Phase ED.11a)

**Status, 2026-11-14:** built and tested locally (`history/tools/test_book_job.py`). Nothing is deployed and no
cloud resource exists. The design this follows is `mchatai_macOS/docs/EDUCATION_CLOUD_SERVICES.md` §7 (ED.6, the
billing grant, and the ED.11 row).

The History Writer's cloud stages run as a server job that bills the user, never Lawrence's Claude Code
subscription. It runs one stage per job step and checkpoints after each one. Every model call goes through
compute-proxy on the user's ED.6 capped grant. This is the platform's own engine (`mchatai-source/history`), not
user-authored compute, so it may run centrally (rule #2).

## What runs

- **The image** is this folder's `Dockerfile`: `history/` and `llm-catalog/request-shapes.json` on
  `python:3.13-slim`, standard library only, running as user 10001. Its entrypoint is `history/tools/book_job.py`.
  Build it from the mchatai-source root:

  ```
  docker build --platform linux/amd64 -f history/jobs/cloud/Dockerfile -t book-job .
  ```

  Pin the base image by digest before the first deploy.
- **One execution** runs `book_job.py run <project> --plan <steps.json>`:
  - It runs the plan's steps in order (`gather`, `write`; see the docstring for the format) through
    `cloud_writer.py`.
  - It writes `<project>/cloud/job.json` when each step starts and when it ends. The file records each step's
    status, attempts, compute tokens and result, plus the grant id(s) the job ran under.
  - A re-execution skips the steps that are done. Inside a step, cloud_writer replays every reply it saved, so a
    rerun pays only for calls that were never answered.
- **Exit codes** are outcomes, not crashes:

  | Code | Status | Meaning |
  |---|---|---|
  | 0 | done | Every step is done. |
  | 1 | blocked | The author must change something: the gate's hard findings after the last round, the chapter budget, a reply cut off, or a refused request. |
  | 3 | paused | The grant is used up, revoked or expired, or the account is out of tokens. |
  | 75 | failed | The model or the identity was unavailable after retries, or SIGTERM arrived. Re-execute as it is. |
  | 2 | (none) | A bad plan or a bad `MCHATAI_GRANT`. job.json is not touched. |

  So the job runs with `--max-retries 0`, and web-api decides what happens next from job.json.

## Where the project lives

Each book is a GCS prefix holding the project folder:
`gs://<bucket>/books/<uid>/<slug>/` with `project.json`, `dossier.json`, `sources/`, `plan.json`, `chapters/` and
`cloud/`.

**A (recommended): mount the bucket.** Use Cloud Run's Cloud Storage volume (gcsfuse) at `/mnt/books`, with no
sync step: the job reads and writes the prefix in place, so job.json is in GCS the moment it is written.
- gcsfuse is not POSIX. A rename is a copy plus a delete, so `save_json`'s write-then-replace works but is not
  atomic across a crash. Run one execution per project at a time.
- The mount needs `mount-options="uid=10001;gid=10001"` for the non-root user.
- If the prefix was uploaded without directory placeholders, it may also need `implicit-dirs`. Check this in the
  smoke test.
- An execution override cannot change volumes, so the job mounts the whole bucket. The project path in `--args`
  picks the book.

**B: sync in and out.** Not built. It needs `gcloud` in the image (a `google-cloud-cli` base) and a wrapper:

```
gcloud storage rsync -r gs://B/books/U/S /work/S
python3 /app/history/tools/book_job.py run /work/S --plan /work/S/cloud/steps.json; code=$?
gcloud storage rsync -r /work/S gs://B/books/U/S     # always, so job.json goes back
exit $code
```

A SIGKILL loses everything written since the sync-in. A does not have that problem.

## Environment

| Variable | Set | What |
|---|---|---|
| `MCHATAI_GRANT` | per execution | The grant id from web-api `POST /v1/learn/grants`. With it set, every call sends `x-mchatai-grant` and a Google ID token. |
| `MCHATAI_GRANT_AUDIENCE` | on the job | Exactly one of compute-proxy's `GRANT_AUDIENCE` values. It defaults to the proxy URL. |
| `COMPUTE_PROXY_URL` | on the job | The compute-proxy URL. It defaults to `cloud-writer.json` `proxyUrl` (`https://api.mchatai.com`). |
| `MCHATAI_JOB_ID` | per execution | Optional. The grant's `jobId`, recorded in job.json. |
| `MCHATAI_GOOGLE_ID_TOKEN` | never on Cloud Run | Local testing only: a token from `gcloud auth print-identity-token --impersonate-service-account=grant-runner@… --audiences=<GRANT_AUDIENCE>`. |

Never set `MCHATAI_SESSION` on the job. The image holds no session, so a job without a grant blocks at its first
call with `no_session`.

On Cloud Run, the ID token comes from the metadata server
(`…/service-accounts/default/identity?audience=…&format=full`, header `Metadata-Flavor: Google`). It is minted as
the job's own account and cached until five minutes before it expires. A 401 mints a fresh one once.

## Identity and IAM

- **The job's account** is `grant-runner@mchatai-2367e.iam.gserviceaccount.com` (`--service-account`). It is the
  account on compute-proxy's `GRANT_CALLERS`, with its `uniqueId` on `GRANT_CALLER_IDS`.
  - Minting its own ID token from the metadata server needs no role and no key file.
  - Its only grant is `roles/storage.objectUser` on the books bucket, as a bucket-level binding. It needs no
    Firestore, no Secret Manager and no Cloud Run permissions.
  - Never run the job as the default compute account: allow-listing that account would let every service running
    as it spend grants.
- **web-api's runtime account** needs:
  - `run.jobs.runWithOverrides`, `run.executions.get` and `run.executions.cancel` on this one job (Cloud Run
    Developer on the job resource, or a custom role).
  - `roles/storage.objectUser` on the bucket, to write the plan and read job.json.
- **Whoever deploys the job** needs `iam.serviceAccounts.actAs` on grant-runner.

## How web-api would start it (design notes; the route is ED.11b, not built)

1. **Quote.** The app shows "up to N compute tokens" for the plan.
   - The sum of the steps' budgets is the plan's ceiling, since each budget caps its chapter's run.
   - Size the grant with headroom. compute-proxy reserves each call's worst case (its `max_tokens` at the dearest
     model in the fallback chain, plus the body's bytes ÷ 3). A grant closer to its cap than one call's estimate
     answers `grant_exhausted` even when the call would have cost less.
   - Measure the headroom on the pilot book.
2. **Consent.** On the user's yes, the app calls `POST /v1/learn/grants {jobId, maxTokens, expiresInHours}` in the
   user's own request, and web-api returns a `grantId`.
3. **Start.** web-api derives the prefix from the verified uid, never from the client, because the job can reach
   the whole bucket. It writes `cloud/steps.json` there (and the project, if it is new), then runs the job:

   ```
   POST https://run.googleapis.com/v2/projects/mchatai-2367e/locations/<region>/jobs/book-job:run
   {"overrides": {"taskCount": 1, "containerOverrides": [{
      "args": ["run", "/mnt/books/<uid>/<slug>", "--plan", "/mnt/books/<uid>/<slug>/cloud/steps.json"],
      "env": [{"name": "MCHATAI_GRANT", "value": "<grantId>"}, {"name": "MCHATAI_JOB_ID", "value": "<jobId>"}]}]}}
   ```

   The response is an Operation naming the execution. Keep it on `learnJobs/{jobId}`.
4. **Progress.** The app polls web-api. web-api reads job.json (status, compute tokens per step) and the
   execution's state.
5. **Outcome.**
   - **done:** the chapters are in the project.
   - **paused:** ask the user to approve more. That creates a new grant, and web-api re-executes with the new
     `MCHATAI_GRANT`. job.json lists every grant the job used.
   - **blocked:** show the step's reason to the author.
   - **failed (75):** re-execute, with backoff, a few times.
6. **Cancel.** Call `POST /v1/learn/grants/:id/revoke`: the job pauses at its next call (402 `grant_revoked`). To
   stop at once, also call `executions/<id>:cancel`. Its SIGTERM checkpoints the step as failed. compute-proxy
   still bills the call in flight, but its reply is lost.
7. **One execution per project at a time.** job.json has no lock, and gcsfuse has no atomic create, so web-api
   must not start a second execution while one is running.

## Deploy (his; nothing here is done)

1. Finish the ED.6 checklist first: the Firestore rules, the grant-runner account, and compute-proxy's
   `GRANT_CALLERS`, `GRANT_AUDIENCE` and `GRANT_CALLER_IDS`.
2. Create the bucket, then grant grant-runner `roles/storage.objectUser` on it:

   ```
   gcloud storage buckets create gs://<bucket> --project mchatai-2367e --location <region> --uniform-bucket-level-access --public-access-prevention
   ```

3. Create an Artifact Registry repo, then build and push the image tagged with the mchatai-source commit.
4. Create the job. No grant is set at deploy time; it comes per execution:

   ```
   gcloud run jobs deploy book-job --project mchatai-2367e --region <region> \
     --image <region>-docker.pkg.dev/mchatai-2367e/<repo>/book-job:<sha> \
     --service-account grant-runner@mchatai-2367e.iam.gserviceaccount.com \
     --tasks 1 --parallelism 1 --max-retries 0 --task-timeout 6h --cpu 1 --memory 1Gi \
     --set-env-vars COMPUTE_PROXY_URL=<proxy url>,MCHATAI_GRANT_AUDIENCE=<one GRANT_AUDIENCE value> \
     --add-volume name=books,type=cloud-storage,bucket=<bucket>,mount-options="uid=10001;gid=10001" \
     --add-volume-mount volume=books,mount-path=/mnt/books
   ```

   A write step makes up to `rounds` writer calls plus its audits, each up to `timeoutSeconds` (900). Size
   `--task-timeout` for the plan, or run one execution per chapter.
5. Smoke test:
   1. Upload `history/fixtures/demo-project` to `books/test/demo`, with a one-step `cloud/steps.json`.
   2. Create a small grant.
   3. Run the job:

      ```
      gcloud run jobs execute book-job --args=run,/mnt/books/test/demo,--plan,/mnt/books/test/demo/cloud/steps.json --update-env-vars MCHATAI_GRANT=<id> --wait
      ```

   4. Check job.json, the grant's `spent`, and the `grant_charge` entries in `audit_log` with the jobId.
   5. Revoke the grant and execute again: it should exit 3 with the job paused.

## Known gaps

- **OpenAI roles.** A role whose request shape takes `max_completion_tokens` gets that and an equal `max_tokens` in
  grant mode, because the grant path requires `max_tokens`. compute-proxy passes OpenAI bodies through whole, and
  OpenAI's reasoning models refuse `max_tokens`. Such a role would fail upstream until compute-proxy drops
  `max_tokens` for those models after its estimate. Today's roles (`cloud-writer.json`) are all Anthropic.
- **Not tried for real.** The metadata-server token path has been tested only against a fake. Nothing has run
  against the real compute-proxy grant path or on Cloud Run; the smoke test above is the first real proof.
- **Option B** (sync in and out) is not built.

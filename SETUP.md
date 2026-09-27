# One-time setup

This setup is performed once. It does not change the AT HOME CHURCH OKINAWA website source of truth and does not require Cloud Billing.

## 1. Create a dedicated service account

In Google Cloud Console, select the existing project:

`at-home-church-okinawa`

Create a dedicated service account such as:

`ahc-deploy-gateway`

Grant these two predefined roles:

- `Firebase Hosting Admin (roles/firebasehosting.admin)`
- `API Keys Viewer (roles/serviceusage.apiKeysViewer)`

Do not grant Owner or Editor.

Firebase Hosting Admin provides read/write access to Hosting resources. Firebase's current IAM documentation also requires API Keys Viewer when deploying through the Firebase CLI.

## 2. Give it read-only access to the canonical Drive folder

Share the canonical Google Drive folder:

`AT HOME CHURCH OKINAWA WEBSITE/PRODUCTION`

with the service-account email as:

`Viewer`

Do not grant Editor access.

The gateway reads only the required root deployment files and the `public/` tree.

## 3. Create the JSON credential

Create one JSON key for the dedicated service account.

Treat this JSON as a password.

Do not:
- upload it to Drive;
- commit it to GitHub;
- paste it into README, workflow code, issues, comments, or logs;
- store it under `public/`.

## 4. Add the GitHub Actions secret

Repository:

`hungrypriest1224-create/AT_HOME_CHURCH_OKINAWA_DEPLOY_GATEWAY`

Open:

`Settings -> Secrets and variables -> Actions -> New repository secret`

Name:

`AHC_DEPLOY_SERVICE_ACCOUNT_JSON`

Value:

the complete JSON credential.

After GitHub confirms the secret is saved, securely delete the downloaded local JSON key file.

## 5. First controlled run

Completed successfully on 2026-09-28 JST.

The first end-to-end gateway run proved all of the following:

1. Drive snapshot was stable.
2. The canonical sitemap update succeeded.
3. The canonical AHC deploy guard succeeded.
4. Drive still matched the captured source fingerprint immediately before deployment.
5. Firebase deploy was limited to Hosting and project `at-home-church-okinawa`.
6. Production runtime verification succeeded.

The normal trigger is now the guarded `.deploy/production-request.json` path updated by ChatGPT after an explicit publication request. Manual `workflow_dispatch` remains an emergency fallback.

The former PC watcher files are archived in Drive under `PRODUCTION/ARCHIVE/RETIRED_PC_DEPLOY/`.

## Manual fallback

The existing Drive `deploy.cmd` remains available as the manual fallback.

Fallback procedure:

1. Confirm Google Drive for Desktop has finished synchronizing the canonical PRODUCTION folder.
2. Run `deploy.cmd` manually.
3. Confirm Firebase CLI reports Hosting deployment success.
4. Verify the production URL.

The manual fallback is not an automatic watcher and must not be registered in Startup or Task Scheduler.

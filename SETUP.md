# One-time setup

This setup is performed once. It does not change the AT HOME CHURCH OKINAWA website source of truth and does not require Cloud Billing.

## 1. Create a dedicated service account

In Google Cloud Console, select the existing project:

`at-home-church-okinawa`

Create a dedicated service account such as:

`ahc-deploy-gateway`

Grant only:

`Firebase Hosting Admin (roles/firebasehosting.admin)`

Do not grant Owner or Editor.

The Hosting Admin role is intended to provide read/write access to Firebase Hosting resources.

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

Open:

`Actions -> Deploy AHC production from Google Drive -> Run workflow`

Use:

- reason: `initial-web-deploy-gateway-verification`
- verify_path: `/`

A successful run must prove all of the following:

1. Drive snapshot is stable.
2. The canonical sitemap update succeeds.
3. The canonical AHC deploy guard succeeds.
4. Drive still matches the captured source fingerprint immediately before deployment.
5. Firebase deploy is limited to Hosting and project `at-home-church-okinawa`.
6. Production runtime verification succeeds.

Only after this end-to-end run succeeds should the old PC watcher files be formally archived/retired in Drive.

## Manual fallback

The existing Drive `deploy.cmd` remains available as the manual fallback.

Fallback procedure:

1. Confirm Google Drive for Desktop has finished synchronizing the canonical PRODUCTION folder.
2. Run `deploy.cmd` manually.
3. Confirm Firebase CLI reports Hosting deployment success.
4. Verify the production URL.

The manual fallback is not an automatic watcher and must not be registered in Startup or Task Scheduler.

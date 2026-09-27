# AT HOME CHURCH OKINAWA Deploy Gateway

This repository is the **deployment execution gateway only** for AT HOME CHURCH OKINAWA.

## Canonical source

The website source of truth remains Google Drive:

`AT HOME CHURCH OKINAWA WEBSITE/PRODUCTION`

The website HTML, CSS, JavaScript, images, MESSAGE content, DISCOVER content, and other production source files are **not stored in this repository**.

## Production target

- Firebase project: `at-home-church-okinawa`
- Production URL: `https://at-home-church-okinawa.web.app`
- Deployment scope: Firebase Hosting only

## Normal release path

1. The user explicitly requests production publication.
2. The GitHub Actions workflow is started manually with `workflow_dispatch`.
3. The gateway reads the canonical Drive PRODUCTION snapshot directly through the Drive API.
4. The gateway verifies that the Drive snapshot did not change while it was being copied.
5. The canonical sitemap updater and deploy guard from Drive are executed against the snapshot.
6. The Drive source fingerprint is checked again immediately before deployment.
7. Firebase Hosting only is deployed to `at-home-church-okinawa`.
8. The production URL is verified.

No fixed Drive-for-Desktop settling delay is used.

## Security

- This public repository must never contain the website source, service-account keys, passwords, tokens, private pastoral information, prayer requests, or other secrets.
- Production credentials are supplied only through GitHub Actions Secrets.
- The deploy identity should have only:
  - read access to the canonical Google Drive PRODUCTION folder;
  - Firebase Hosting deployment permission for `at-home-church-okinawa`.
- Fork, push, pull-request, issue-comment, and scheduled events do not deploy production.
- No Actions artifact or cache stores the Drive snapshot.

## Required repository secret

`AHC_DEPLOY_SERVICE_ACCOUNT_JSON`

The value is the JSON credential for the dedicated AHC deploy service account. Do not commit it.

## Manual fallback

The canonical Drive `deploy.cmd` remains the emergency/manual fallback. The user may confirm Google Drive for Desktop synchronization and run it explicitly from the PC.

The former automatic Windows watcher is retired only after this gateway successfully completes an end-to-end production deployment.

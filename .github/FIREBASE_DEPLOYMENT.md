# Firebase deployment authentication

The production deployment workflow uses Google Application Default Credentials through a Firebase/Google service-account JSON stored as a GitHub Actions secret. Firebase's current CLI documentation identifies `FIREBASE_TOKEN` as a legacy, less-secure authentication method and recommends Application Default Credentials instead.

## Required repository secrets

Configure these under **Settings → Secrets and variables → Actions → Repository secrets**:

- `FIREBASE_PROJECT_ID` — the Firebase project ID.
- `FIREBASE_SERVICE_ACCOUNT` — the complete JSON contents of a Google/Firebase service-account key that has permission to deploy the project's Hosting and Cloud Functions resources.

Do not commit the JSON key or paste it into source files.

## Creating the service-account key

In the Firebase console, open **Project settings → Service accounts**, generate a new private key, and store the downloaded JSON securely. Copy the complete JSON object into the `FIREBASE_SERVICE_ACCOUNT` GitHub secret.

The service account must have the IAM permissions required to deploy the configured Firebase resources. If the project was configured through Firebase's GitHub integration, Firebase can create a deployment service account and GitHub secret automatically.

## Deployment behavior

`.github/workflows/firebase-deploy.yml` runs on pushes to `main` and on manual dispatch. It builds `@workspace/killer-pool`, authenticates with the service account using `google-github-actions/auth@v2`, and runs the Firebase CLI deployment for Hosting and Functions.

The old `FIREBASE_TOKEN` secret is no longer referenced by the workflow. It may be removed from GitHub repository secrets after this workflow is verified successfully.
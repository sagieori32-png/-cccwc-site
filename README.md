# CCCWC Site — Netlify deployment

A single-page CCCWC website with admin editing, password protection, and cloud-stored
content + images. All edits made by admins are visible to every visitor immediately.

## What's in here

```
cccwc-netlify/
├── public/
│   └── index.html          ← the website
├── netlify/
│   └── functions/
│       └── data.js         ← API: login, content, images
├── netlify.toml            ← Netlify config
├── package.json            ← dependencies
└── README.md               ← this file
```

## How it works

- **Visitors** see the live site with whatever content/images the admins last saved.
- **Admins** click "Edit", enter the password, and edit the page directly. Edits are
  auto-saved to the server every 2 seconds. Image uploads go straight to the cloud.
- All content lives in **Netlify Blobs** (free, no extra setup).

## Deploy steps

### 1. Create a Netlify site connected to a Git repository

The drag-and-drop method does NOT support Functions — you need a Git connection.

**Option A — Use GitHub (recommended):**

1. Go to <https://github.com/new>, create a new repo called `cccwc-site` (private is fine).
2. Push this folder to it:
   ```bash
   cd cccwc-netlify
   git init
   git add .
   git commit -m "Initial CCCWC site"
   git branch -M main
   git remote add origin https://github.com/<your-user>/cccwc-site.git
   git push -u origin main
   ```
3. In Netlify, **Add new site → Import an existing project → GitHub → cccwc-site**.
4. Build settings: leave defaults (Netlify reads `netlify.toml`). Click **Deploy**.

**Option B — Netlify CLI (no GitHub):**

```bash
npm install -g netlify-cli
cd cccwc-netlify
netlify login
netlify init       # follow prompts to create a new site
netlify deploy --prod
```

### 2. Set the admin password (important!)

By default the password is hardcoded as `1q2w3e4r5t`. Change it before sharing
the site URL with anyone.

In the Netlify dashboard for your site:
**Site configuration → Environment variables → Add a variable**

- Key: `ADMIN_PASSWORD`
- Value: `<choose a strong password>`
- Scopes: All scopes
- Save, then **Deploys → Trigger deploy → Deploy site** (so the function picks up
  the new env var).

Share this password only with the 2-3 people who should be able to edit.

### 3. Connect your custom domain

In Netlify: **Domain management → Add a domain** → follow the DNS instructions.
HTTPS provisions automatically once DNS resolves.

## Editing workflow

1. Visit the site URL.
2. Click **Edit** (top right).
3. Enter the admin password — it's cached for 12 hours per browser, then the
   server re-verifies on the next attempt.
4. Click any text to edit. Click any photo placeholder to upload an image.
   The "+" buttons add new members/teams/objectives/publications. The "×" on each
   card deletes it.
5. Edits save automatically 2 seconds after you stop typing. You can also
   click **💾 Save** to force an immediate save.
6. When you're done, click **Done** to exit edit mode.

Other people visiting the site (without the password) see only the read-only
view — the Edit button is visible but locked behind the password.

## Resetting / rotating the password

Just change the `ADMIN_PASSWORD` environment variable in the Netlify dashboard
and trigger a redeploy. All existing logged-in tokens become invalid immediately
because the token signature uses the password as its secret.

## Local development (optional)

```bash
cd cccwc-netlify
npm install
netlify dev
```

This runs the site at `http://localhost:8888` with the Functions live, using a
local Blobs sandbox.

## Troubleshooting

- **"Cannot save: Unauthorized"** — your 12-hour token expired. Click Edit again
  and re-enter the password.
- **Images don't appear for other visitors** — make sure they're not visiting
  the old URL (e.g. the localhost or pre-deploy URL). Hard-refresh once after
  saves (Ctrl/Cmd+Shift+R).
- **Function returns 500** — check **Logs → Functions** in Netlify dashboard.
  Most common cause: forgot to set `ADMIN_PASSWORD` env var (works with the
  fallback, but worth setting properly).

# Social publisher (Instagram + Facebook)

Posts from `social/schedule.json` go out automatically to @noemptychair and the
No Empty Chair Facebook Page. A Netlify scheduled function checks every 10
minutes and publishes anything that is due. Supports single images, carousels
(2 to 10 items), Reels, and Stories on both platforms.

Status page and controls: **https://noemptychair.co/admin/social** (admin password).

## Day to day

1. Export the posts from your calendar into a folder (JPG or PNG for images, MP4 for video).
2. Make a CSV (or JSON) of the calendar. Columns:

   | column | example | notes |
   |---|---|---|
   | date | 2026-10-05 | Eastern time assumed |
   | time | 12:00 PM | |
   | type | image / carousel / reel / story | |
   | platforms | IG, FB | blank = both |
   | media | `slide1.png\|slide2.png` | file names (or full URLs), `\|` between carousel items |
   | caption | full caption | ignored for Stories |
   | caption_facebook | optional | different caption for FB |
   | cover | optional | Reel cover image |
   | status | ready / draft / paused | only `ready` posts publish |

3. Import it (converts PNGs to JPEG, which Instagram requires, and copies media into `public/social/media/`):

   ```
   npm run social:import -- "path/to/calendar.csv" --media "path/to/exports"
   ```

   Re-importing updates posts with the same id. `--replace` starts the schedule over.
   `--ready` marks rows with a blank status as ready. `npm run social:check` validates.

4. Commit + push. Netlify redeploys and the publisher picks up the new schedule.

To pull a post: set its `status` to `paused` (or delete it) and push before its time.
A post that could not start within 6 hours of its time is marked **missed** and is
never posted late (change with `SOCIAL_MAX_LATE_MINUTES`). Failures email
`SOCIAL_NOTIFY_EMAIL` (uses the existing `RESEND_API_KEY`) and show a Retry button
on the status page.

Media can also live anywhere public (Cloudinary, etc.): put the full URL in `media`.
Video specs Meta expects for Reels/Stories: MP4, 9:16, 1080x1920, 3 to 90 seconds
(Stories max 60), AAC audio.

## One-time setup

**1. Meta app + token** (the IG account must be a professional account linked to the Page, which it is)

1. developers.facebook.com > My Apps > Create App (business type). Nothing needs App Review:
   the app stays in Development mode because it only posts to accounts you own.
2. App settings > Basic: copy the **App ID** and **App Secret**.
3. Tools > Graph API Explorer: select the app, then Get User Access Token with:
   `pages_show_list, pages_read_engagement, pages_manage_posts, instagram_basic,
   instagram_content_publish, business_management`.
   In the popup, select the No Empty Chair Page and @noemptychair.
4. Run locally (prints the values, writes nothing):

   ```
   META_APP_ID=... META_APP_SECRET=... npm run meta:token -- <token from Explorer>
   ```

   It should say `Page token expires: never`.

**2. Netlify env vars** (Site configuration > Environment variables; never commit these, the repo is public)

| var | value |
|---|---|
| `META_PAGE_ID` | from step 4 |
| `META_PAGE_TOKEN` | from step 4 |
| `META_IG_USER_ID` | from step 4 |
| `SOCIAL_PUBLISHER_ENABLED` | `true` to go live (leave unset to stay paused) |
| `SOCIAL_NOTIFY_EMAIL` | optional, defaults to LEAD_TO_EMAIL / hello@noemptychair.co |
| `META_GRAPH_VERSION` | optional, defaults to v25.0 |

Redeploy after changing env vars.

**3. Test**: open /admin/social > **Check connection** (all green) > **Dry run**.
Add a test post a few minutes out, push, and press **Run now** once it is due.

## How it works

- `netlify/functions/social-publisher.mjs` runs every 10 minutes (production deploys only).
- `netlify/lib/social-publisher.mjs` does the work. Progress for each post is saved in
  Netlify Blobs (store `social-publisher`) after every step, so video processing that
  takes several minutes simply finishes on a later run, and nothing double-posts.
- Instagram: create container(s) > wait until FINISHED > publish (limit 100 posts / 24h).
- Facebook: `/photos` for images, unpublished photos + `/feed` for multi-photo posts,
  `/video_reels` for Reels, `/photo_stories` and `/video_stories` for Stories.
  Facebook multi-photo posts cannot include video.

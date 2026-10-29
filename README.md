# Nørre News

The public newsletter site for Nørre Gymnasium (HTML + CSS + a little JavaScript).

## How the content works
- The text written in `index.html` is the **default** content.
- Writers publish posts from the separate Writers' Desk site
  (`newsletter-admin` folder). Published posts are stored in Firebase and
  `app.js` puts them into the page when someone visits.
- A section with no published posts keeps its default text, so the site
  never looks empty.
- Until `firebase-config.js` is filled in, the site simply shows the default text.

## Files
- `index.html`: page layout + default content
- `style.css`: design
- `app.js`: loads published posts from Firebase
- `firebase-config.js`: your Firebase settings (same as in newsletter-admin)
- `.nojekyll`: tells GitHub Pages to serve the files as-is

## Updating the site code
    git add .
    git commit -m "What you changed"
    git push

GitHub Pages redeploys automatically after each push.

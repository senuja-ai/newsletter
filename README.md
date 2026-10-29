# Nørre News

A simple static school newsletter website (HTML + CSS, no build step).

## Files
- `index.html` – the newsletter content
- `style.css` – the design
- `.nojekyll` – tells GitHub Pages to serve the files as-is

## Editing
Open `index.html` in any text editor and change the text inside the sections
(News, Events, Spotlight, Student Corner, Contact). Replace
`your-email@example.com` with a real contact address.

## Preview locally
Double-click `index.html`, or from this folder run:

    python -m http.server 8000

and open http://localhost:8000

## Publishing on GitHub Pages
See the instructions you were given, or in short:

    git init
    git add .
    git commit -m "First issue of Nørre News"
    git branch -M main
    git remote add origin https://github.com/<your-username>/2inewsletter.git
    git push -u origin main

Then on GitHub: Settings → Pages → Source: "Deploy from a branch" →
Branch: `main`, folder `/ (root)` → Save.

The site appears at `https://<your-username>.github.io/2inewsletter/`.

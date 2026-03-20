# Mom Tablet Tracker (GitHub Pages)

A simple mobile-friendly app to track daily medicine dose boxes.

## What this app does

- Shows dates from today onward.
- Each date has 2 checkboxes for the plan:
	- Full
	- Half
- Saves every tick immediately on the phone (local storage).
- Optional cloud sync using Google Sheets + Google Apps Script, so data can be shared across devices.
- Works on GitHub Pages.

## Files

- `index.html` - app UI
- `styles.css` - design and responsive layout
- `app.js` - logic, storage, and sync
- `sw.js` - offline caching for phone usage
- `manifest.webmanifest` - install as app on phone
- `google-apps-script/Code.gs` - backend script for Google Sheets sync

## Quick Start (local save only)

1. Create a GitHub repo and upload all files in this project.
2. In GitHub repo settings, enable GitHub Pages from branch `main` and folder `/ (root)`.
3. Open the published URL on your mom's phone.
4. Tick boxes daily. Data is saved on that phone.

## Cloud Sync Setup (Google Sheets)

Use this if you want data stored in Google cloud and available on other devices.

### Step 1: Create Google Sheet and Apps Script

1. Create a new Google Sheet.
2. Open **Extensions > Apps Script**.
3. Replace code with content from `google-apps-script/Code.gs`.
4. Save.

### Step 2: Deploy as Web App

1. Click **Deploy > New deployment**.
2. Type: **Web app**.
3. Execute as: **Me**.
4. Who has access: **Anyone**.
5. Deploy and copy the Web App URL.

### Step 3: Add endpoint in app

1. Open your GitHub Pages app.
2. Tap **Settings**.
3. Paste the Apps Script URL and save.
4. Tap **Sync now** once.

## Phone Tips

- In mobile browser, choose **Add to Home Screen** for app-like experience.
- The app also works offline for previously loaded pages.

## Notes

- If endpoint is empty, app uses local-only storage.
- If endpoint is set, app still keeps local backup and syncs to cloud.
- For long-term usage, keep one Google account for sheet ownership.

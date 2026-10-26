# NU Room Finder

A Chromium extension that finds available rooms on the NU student portal, with building, capacity, and equipment filters.

## Install

Requires a desktop Chromium browser and access to NU Room Booking.

1. Open this repository's **Releases** page, download **nu-room-finder.zip**, and extract it. The **Source code** downloads are for developers.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the extracted folder containing `manifest.json`.
4. Open NU **Room Booking**, choose **only for one time**, and refresh the page.

To update, replace the files in your installed folder with the latest ZIP's contents, click **Reload** on the extension's card, and refresh the portal.

## Use

1. Choose a date and time range, then click **Find rooms**.
2. Filter the results and click **Select** to recheck a room and fill the booking form.
3. Review the form, complete the club/purpose fields, and submit it there.

Dates can be up to 28 days ahead. Times use Astana time and 15-minute increments within the same day.

## Development

Use Node.js (see `.nvmrc`), pnpm, `zip`, and `unzip`.

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm build
```

Load `dist/` for local development. Run `pnpm run package` to create `release/nu-room-finder.zip`. Pushing a `v<version>` tag matching `package.json` and `manifest.json` runs the tests and publishes the ZIP as a GitHub Release.

## License

[MIT](LICENSE). Icons retain their [Hugeicons MIT notice](assets/hugeicons-LICENSE.txt).

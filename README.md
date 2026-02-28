# URL Porter

A Chrome extension that lets you configure redirect rules and set a custom homepage. Enhance your browsing experience by easily setting up URL redirects and a personalized new tab page.

## Features

- **URL Redirection** - Define rules to automatically redirect URLs based on patterns
- **Custom New Tab** - Replace Chrome's default new tab page with your own homepage
- **Add Link Page** - Quickly add new redirect rules from a dedicated page
- **Sync Server** - Optionally sync your configuration from a remote JSON file
- **Monaco Editor** - Edit your configuration with a full-featured code editor

## Configuration

The config is a JSON array of redirect rules. Each rule can be:

- An object with `from` (pattern to match) and `to` (destination URL)
- A shorthand array `["keyword", "url"]`

### Sample Config JSON

```json
[
  {
    "from": "||fav^",
    "to": "http://synle.github.io/fav/"
  },
  {
    "from": "||plex^",
    "to": "https://app.plex.tv/desktop/#!/"
  },
  ["google", "google.com"]
]
```

## Development

### Prerequisites

- Node.js 20.19+ (use `nvm use` or [Volta](https://volta.sh/) — the project pins Node 20.19.1 via Volta)
- npm

### Setup

```bash
# Clone the repo
git clone https://github.com/synle/url-porter.git
cd url-porter

# Install dependencies
npm install
```

### Environment Variables

You can customize the default sync server URL by creating a `.env` file:

```bash
VITE_DEFAULT_URL_PORTER_SYNC_SERVER_URL=https://your-server.com/config.json
```

If no `.env` file exists, it defaults to: `https://synle.github.io/fav/url-porter.json`

### Dev Server

```bash
npm run dev
```

This starts the Vite dev server with hot reload for rapid development.

### Build the Extension

```bash
npm run build
```

The built extension will be output to the `dist` directory.

### Load in Chrome

1. Navigate to `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist` directory

After making changes, run `npm run build` again and click the reload button on the extension card.

### Scripts

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server with hot reload |
| `npm run build` | Build the extension for production |
| `npm run bundle` | Create a zip from the built extension |
| `npm run package` | Build + bundle in one command (creates `url-porter.zip`) |
| `npm run format` | Format code with Prettier |

### Project Structure

```
src/
├── background/      # Service worker (redirect logic)
├── helpers/         # Shared utilities
├── pages/
│   ├── addlink/     # Add-link page (quick-add UI)
│   ├── newtab/      # Custom new tab page
│   └── options/     # Extension options / config editor
├── manifest.json    # Chrome extension manifest
└── theme.jsx        # MUI theme configuration
```

### Tech Stack

- **React 19** + **Vite** — build and dev tooling
- **MUI (Material UI)** — component library and theming
- **Monaco Editor** — in-browser code editor for config JSON
- **Sass** — stylesheets

## Installation

### Mac / Linux

```bash
curl -L -o url-porter.zip https://github.com/synle/url-porter/raw/main/url-porter.zip && unzip url-porter.zip -d url-porter
```

### Windows

```bash
powershell -Command "Start-BitsTransfer -Source https://github.com/synle/url-porter/raw/main/url-porter.zip -Destination url-porter.zip"
powershell -Command "Expand-Archive -Path url-porter.zip -DestinationPath url-porter"
```

Then load the `url-porter` folder as an unpacked extension in Chrome (see [Load in Chrome](#load-in-chrome) above).

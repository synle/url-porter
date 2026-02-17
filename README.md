# URL Porter

This extension lets you configure redirect rules and set a custom homepage. Enhance your browsing experience with this extension, designed to help you customize your online environment. Easily configure redirect rules and set a personalized homepage to better suit your needs

## Configuration Object for URL Redirection

The `config` object is used to define conditions for redirecting URLs based on specific patterns or criteria. It consists of the following properties:

- `from`: The source pattern or string that needs to be matched with the URL or hostname.

- `to`: The destination URL to which the browser will be redirected if the condition is met.

## Sample Config JSON:

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

- Node.js 20.19+ or 22.12+ (use `nvm use` to switch to the correct version)
- npm

### Environment Variables

You can customize the default sync server URL by creating a `.env` file:

```bash
# Copy the example file
cp .env.example .env

# Edit .env and set your custom URL
VITE_DEFAULT_URL_PORTER_SYNC_SERVER_URL=https://your-server.com/config.json
```

If no `.env` file exists, it defaults to: `https://synle.github.io/fav/url-porter.json`

### Build the Extension

```bash
# Install dependencies
npm install

# Build the extension
npm run build
```

The built extension will be in the `dist` directory.

### Development Workflow

1. Make changes to files in the `src` directory
2. Run `npm run build` to build the extension
3. Load the `dist` directory as an unpacked extension in Chrome:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `dist` directory

### Scripts

- `npm run build` - Build the extension for production
- `npm run bundle` - Create a zip file from the built extension
- `npm run package` - Build and bundle in one command (creates url-porter.zip)
- `npm run dev` - Start development server with hot reload
- `npm run format` - Format code with Prettier

### Creating Distribution Package

To create a distribution zip file:

```bash
npm run package
```

This will:

1. Build the extension from source
2. Create `url-porter.zip` containing only the distribution files

The zip file contains only the necessary Chrome extension files from the `dist` directory.

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

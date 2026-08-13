/** Version patching for the tracked src/manifest.json source file. */

/**
 * Matches the top-level `"version"` string field.
 *
 * `"manifest_version"` is deliberately not matched: there is no quote directly
 * before its `version` text, and its value is a bare number rather than a
 * quoted string.
 *
 * @type {RegExp}
 */
const VERSION_PATTERN = /(^\s*"version"\s*:\s*)"[^"]*"/m;

/**
 * Set the version in a manifest.json source string without reformatting it.
 *
 * A `JSON.parse` / `JSON.stringify` round-trip re-expands the arrays that the
 * repo formatter keeps collapsed, which made every release emit a spurious
 * "format code" commit that only reflowed this one file. Patching the version
 * text in place keeps the committed formatting byte-for-byte identical.
 *
 * @param {string} raw - Contents of a manifest.json file.
 * @param {string} version - Version to set.
 * @returns {string} The manifest contents with the version replaced.
 * @throws {Error} When no top-level version field is present.
 */
export function setManifestVersion(raw, version) {
  if (!VERSION_PATTERN.test(raw)) {
    throw new Error('Could not find a top-level "version" field in manifest.json');
  }
  return raw.replace(VERSION_PATTERN, `$1"${version}"`);
}

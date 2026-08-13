/**
 * Tests for scripts/manifestVersion — in-place version patching that must not
 * reformat the tracked src/manifest.json source file.
 */

import { describe, it, expect } from "vitest";
import { setManifestVersion } from "../scripts/manifestVersion.js";

const MANIFEST = `{
  "manifest_version": 3,
  "name": "URL Porter",
  "version": "1.90.0",
  "description": "Redirect rules.",
  "host_permissions": ["*://*/*"],
  "content_scripts": [
    {
      "matches": ["https://example.com/*"],
      "js": ["content/a.js", "content/b.js"]
    }
  ]
}
`;

describe("setManifestVersion", () => {
  it("replaces the top-level version", () => {
    const out = setManifestVersion(MANIFEST, "1.91.0");
    expect(out).toContain('"version": "1.91.0"');
    expect(out).not.toContain('"version": "1.90.0"');
  });

  it("leaves manifest_version untouched", () => {
    const out = setManifestVersion(MANIFEST, "1.91.0");
    expect(out).toContain('"manifest_version": 3');
  });

  it("preserves the rest of the file byte for byte", () => {
    const out = setManifestVersion(MANIFEST, "1.91.0");
    // A JSON round-trip would re-expand these collapsed arrays, which is what
    // made every release produce a spurious "format code" commit.
    expect(out).toContain('"host_permissions": ["*://*/*"],');
    expect(out).toContain('"js": ["content/a.js", "content/b.js"]');
    expect(out.replace('"1.91.0"', '"1.90.0"')).toBe(MANIFEST);
  });

  it("is a no-op when the version already matches", () => {
    expect(setManifestVersion(MANIFEST, "1.90.0")).toBe(MANIFEST);
  });

  it("throws when there is no top-level version field", () => {
    expect(() => setManifestVersion('{\n  "manifest_version": 3\n}\n', "1.91.0")).toThrow(
      /version/,
    );
  });
});

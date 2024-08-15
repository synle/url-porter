# url-portal

This extension lets you configure redirect rules and set a custom homepage. Enhance your browsing experience with this extension, designed to help you customize your online environment. Easily configure redirect rules and set a personalized homepage to better suit your needs

## Configuration Object for URL Redirection

The `config` object is used to define conditions for redirecting URLs based on specific patterns or criteria. It consists of the following properties:

- `type`: Specifies the type of comparison to be used for redirecting.

  - **Values**:
    - `"regex"`: Uses a regular expression for pattern matching. If the `from` value matches the `url` using the regular expression, the redirect will occur.
    - `"equal"`: Compares the `from` value with the `hostname` for equality. This is also the default case if the `type` is not specified.

- `from`: The source pattern or string that needs to be matched with the URL or hostname.

  - **Usage**:
    - If `type` is `"regex"`, `from` is treated as a regular expression pattern.
    - If `type` is `"equal"`, `from` is treated as a literal string to be compared.

- `ignoreCase` (optional): A boolean flag (defaulting to `true`) that indicates whether the comparison should be case-insensitive.

- `to`: The destination URL to which the browser will be redirected if the condition is met.

## Sample Config JSON:

```json
[
  {
    "from": "fav",
    "to": "http://synle.github.io/fav/",
    "type": "regex"
  },
  {
    "from": "plex",
    "to": "https://app.plex.tv/desktop/#!/",
    "type": "equal"
  }
]
```

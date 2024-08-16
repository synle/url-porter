# url-portal

This extension lets you configure redirect rules and set a custom homepage. Enhance your browsing experience with this extension, designed to help you customize your online environment. Easily configure redirect rules and set a personalized homepage to better suit your needs

## Configuration Object for URL Redirection

The `config` object is used to define conditions for redirecting URLs based on specific patterns or criteria. It consists of the following properties:

- `from`: The source pattern or string that needs to be matched with the URL or hostname.

- `to`: The destination URL to which the browser will be redirected if the condition is met.

## Sample Config JSON:

```json
[
  {
    "from": "fav",
    "to": "http://synle.github.io/fav/"
  },
  {
    "from": "plex",
    "to": "https://app.plex.tv/desktop/#!/"
  }
]
```

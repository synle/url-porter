/**
 * Shared placeholder and helper text constants for form fields.
 * Used by AddLink popup and Options dialogs to keep guidance consistent.
 */

export const ALIAS_PLACEHOLDER = "e.g. my-shortcut";

export const ALIAS_HELPER_TEXT =
  'Bare word (e.g. "drive") matches anywhere in URL. ' +
  '"||" anchors to domain start. "^" requires a separator (/, :, ?) after. ' +
  'e.g. "||drive^" only matches http://drive/';

export const URL_PLACEHOLDER = "https://example.com";

export const URL_HELPER_TEXT = "The URL this alias will redirect to";

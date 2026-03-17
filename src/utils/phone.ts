/**
 * Normalizes a phone number to E.164 format: +[country code][number]
 * Strips spaces, dashes, and parentheses, then ensures a '+' prefix.
 *
 * Examples:
 *   "972501234567"   → "+972501234567"
 *   "+972 50 123 4567" → "+972501234567"
 *   "+972-50-123-4567" → "+972501234567"
 *   "(972) 50 1234567" → "+972501234567"
 */
export function normalizePhone(phone: string): string {
  const stripped = phone.replace(/[\s\-().]/g, '')
  return stripped.startsWith('+') ? stripped : `+${stripped}`
}

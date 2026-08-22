// Builds a wa.me deep link from a stored phone number. Numbers in this app
// are usually already full international format (e.g. "966501234567"), but
// this also handles a local Saudi format with a leading 0 ("0501234567") by
// swapping it for the 966 country code.
export function waLink(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const withCountryCode = digits.startsWith('0') ? `966${digits.slice(1)}` : digits;
  return `https://wa.me/${withCountryCode}`;
}

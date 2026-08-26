// Builds a wa.me deep link from a stored phone number. Numbers in this app
// are usually already full international format (e.g. "966501234567"), but
// this also handles a local Saudi format with a leading 0 ("0501234567") by
// swapping it for the 966 country code.
//
// The link only names the recipient — wa.me has no concept of "sender".
// Whoever taps it sends from whichever WhatsApp account is logged in on
// their own device/browser at that moment, so a button meant to look like
// it's "from the company" (e.g. طلب تقييم) only works as intended when
// clicked from a device signed in to the company's WhatsApp number.
export function waLink(phone: string, text?: string): string {
  const digits = phone.replace(/\D/g, '');
  const withCountryCode = digits.startsWith('0') ? `966${digits.slice(1)}` : digits;
  const base = `https://wa.me/${withCountryCode}`;
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

// نص طلب التقييم — يُرسَل عبر واتساب من AppointmentDetailModal بعد اكتمال
// الخدمة وإصدار الفاتورة. الرابط يفتح صفحة تقييم عامة (5 نجوم + رأي مختصر)
// بلا تسجيل دخول، انظر src/client/pages/RatePage.tsx.
export function ratingRequestMessage(customerName: string, ratingUrl: string): string {
  return `عزيزنا ${customerName}، سعدنا بفرصة خدمتك اليوم! 🌟\n\nرأيك يهمنا ويساعدنا لنكون دائماً عند حسن ظنّك، شاركنا تقييمك للخدمة من هنا:\n\n${ratingUrl}`;
}

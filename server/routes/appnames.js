// Readable app names from Android package names (no per-app lookup on the phone: that is slow).
const KNOWN = {
  'com.whatsapp': 'WhatsApp', 'com.whatsapp.w4b': 'WhatsApp Business', 'com.instagram.android': 'Instagram', 'com.facebook.katana': 'Facebook',
  'com.facebook.orca': 'Messenger', 'com.snapchat.android': 'Snapchat', 'org.telegram.messenger': 'Telegram', 'com.google.android.gm': 'Gmail',
  'com.google.android.youtube': 'YouTube', 'com.android.chrome': 'Chrome', 'com.google.android.apps.messaging': 'Messages', 'com.android.mms': 'Messages',
  'com.google.android.dialer': 'Phone', 'com.android.dialer': 'Phone', 'com.android.settings': 'Settings', 'com.google.android.apps.maps': 'Maps',
  'com.linkedin.android': 'LinkedIn', 'com.twitter.android': 'X', 'com.microsoft.appmanager': 'Link to Windows', 'com.google.android.apps.photos': 'Photos',
  'com.android.vending': 'Play Store', 'com.spotify.music': 'Spotify', 'com.digilocker.android': 'DigiLocker', 'com.google.android.calendar': 'Calendar',
  'com.google.android.googlequicksearchbox': 'Google', 'net.one97.paytm': 'Paytm', 'com.phonepe.app': 'PhonePe', 'com.google.android.apps.nbu.paisa.user': 'Google Pay',
  'in.amazon.mShop.android.shopping': 'Amazon', 'com.amazon.mShop.android.shopping': 'Amazon', 'com.flipkart.android': 'Flipkart', 'com.discord': 'Discord'
};
const GENERIC = new Set(['android', 'app', 'apps', 'mobile', 'main', 'client', 'lite', 'beta', 'release', 'prod', 'free', 'pro', 'phone', 'droid', 'mshop', 'user', 'ui']);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export function friendlyApp(pkg) {
  if (!pkg) return '';
  if (KNOWN[pkg]) return KNOWN[pkg];
  const parts = String(pkg).split('.').filter(Boolean);
  const TLD = new Set(['com', 'in', 'org', 'net', 'io', 'co', 'app', 'me']);
  const body = parts.filter((p, i) => !(i === 0 && TLD.has(p)));
  for (let i = body.length - 1; i >= 0; i--) if (!GENERIC.has(body[i].toLowerCase())) return cap(body[i]);
  return cap(body[body.length - 1] || parts[parts.length - 1] || pkg);
}

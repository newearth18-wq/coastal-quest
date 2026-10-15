export function roomJoinUrl(origin: string, pin: string): string {
  if (!/^\d{6}$/.test(pin)) throw new Error("รหัสห้องต้องมี 6 หลัก");
  const site = new URL(origin);
  if (!['https:', 'http:'].includes(site.protocol)) throw new Error("ลิงก์ไม่ถูกต้อง");
  const url = new URL('/', site.origin);
  url.searchParams.set('room', pin);
  return url.href;
}


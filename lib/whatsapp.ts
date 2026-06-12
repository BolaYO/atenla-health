export function buildWhatsAppLink(phone: string | null | undefined, message: string): string | null {
  if (!phone) return null
  let digits = phone.replace(/[^0-9]/g, '')
  if (digits.startsWith('0')) digits = '234' + digits.slice(1)
  if (!digits.startsWith('234') && digits.length <= 10) digits = '234' + digits
  return 'https://wa.me/' + digits + '?text=' + encodeURIComponent(message)
}
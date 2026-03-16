export type Lang = 'he' | 'en'

const categoryTranslations: Record<string, Record<Lang, string>> = {
  equipment: { en: 'Equipment', he: 'ציוד' },
  food: { en: 'Food', he: 'אוכל' },
}

const unitTranslations: Record<string, Record<Lang, string>> = {
  pcs: { en: 'pcs', he: 'יח׳' },
  kg: { en: 'kg', he: 'ק"ג' },
  g: { en: 'g', he: 'גרם' },
  lb: { en: 'lb', he: 'ליברה' },
  oz: { en: 'oz', he: 'אונקיה' },
  l: { en: 'l', he: 'ליטר' },
  ml: { en: 'ml', he: 'מ"ל' },
  m: { en: 'm', he: 'מטר' },
  cm: { en: 'cm', he: 'ס"מ' },
  pack: { en: 'pack', he: 'חבילה' },
  set: { en: 'set', he: 'סט' },
}

interface InviteMessageParams {
  planTitle: string
  deepLink: string
}

interface JoinRequestMessageParams {
  requesterName: string
  planTitle: string
  deepLink: string
}

interface JoinRequestApprovedMessageParams {
  planTitle: string
  deepLink: string
}

interface JoinRequestRejectedMessageParams {
  planTitle: string
}

interface SendListMessageParams {
  planTitle: string
  categoryBlocks: string
  emptyList: boolean
}

export interface ItemForList {
  name: string
  quantity: number
  unit: string | null
  category: string | null
}

const templates = {
  invite: {
    en: (p: InviteMessageParams) =>
      `Hi 👋 You've been invited to "${p.planTitle}". View details and RSVP here: ${p.deepLink}`,
    he: (p: InviteMessageParams) =>
      `היי 👋 הוזמנת לתוכנית "${p.planTitle}". לצפייה בפרטים ואישור הגעה: ${p.deepLink}`,
  },
  joinRequest: {
    en: (p: JoinRequestMessageParams) =>
      `New join request ✋ ${p.requesterName} wants to join "${p.planTitle}". Review: ${p.deepLink}`,
    he: (p: JoinRequestMessageParams) =>
      `בקשת הצטרפות חדשה ✋ ${p.requesterName} רוצה להצטרף ל"${p.planTitle}". לבדיקה: ${p.deepLink}`,
  },
  joinRequestApproved: {
    en: (p: JoinRequestApprovedMessageParams) =>
      `Great news! 🎉 Your request to join "${p.planTitle}" has been approved. View the plan: ${p.deepLink}`,
    he: (p: JoinRequestApprovedMessageParams) =>
      `חדשות טובות! 🎉 בקשתך להצטרף ל"${p.planTitle}" אושרה. לצפייה בתוכנית: ${p.deepLink}`,
  },
  joinRequestRejected: {
    en: (p: JoinRequestRejectedMessageParams) =>
      `Your request to join "${p.planTitle}" was not approved. If you think this is a mistake, please contact the plan organizer.`,
    he: (p: JoinRequestRejectedMessageParams) =>
      `בקשתך להצטרף ל"${p.planTitle}" לא אושרה. אם לדעתך מדובר בטעות, אנא צור/צרי קשר עם מארגן/ת התוכנית.`,
  },
  sendListHeader: {
    en: (planTitle: string) => `📋 *${planTitle}*\n\n`,
    he: (planTitle: string) => `📋 *${planTitle}*\n\n`,
  },
  sendListEmpty: {
    en: '_No items yet_',
    he: '_אין פריטים עדיין_',
  },
} as const

export function resolveLanguage(defaultLang: string | null | undefined): Lang {
  if (defaultLang === 'he') return 'he'
  return 'en'
}

export function inviteMessage(lang: Lang, params: InviteMessageParams): string {
  return templates.invite[lang](params)
}

export function joinRequestMessage(
  lang: Lang,
  params: JoinRequestMessageParams
): string {
  return templates.joinRequest[lang](params)
}

export function joinRequestApprovedMessage(
  lang: Lang,
  params: JoinRequestApprovedMessageParams
): string {
  return templates.joinRequestApproved[lang](params)
}

export function joinRequestRejectedMessage(
  lang: Lang,
  params: JoinRequestRejectedMessageParams
): string {
  return templates.joinRequestRejected[lang](params)
}

export function translateCategory(category: string, lang: Lang): string {
  return categoryTranslations[category]?.[lang] ?? category
}

export function translateUnit(unit: string, lang: Lang): string {
  return unitTranslations[unit]?.[lang] ?? unit
}

export function resolvePlanTitle(
  title: string | null | undefined,
  lang: Lang
): string {
  return title ?? (lang === 'he' ? 'תוכנית ללא שם' : 'Untitled Plan')
}

export function formatItemList(items: ItemForList[], lang: Lang): string {
  if (items.length === 0) return ''
  const grouped: Record<string, string[]> = {}
  for (const item of items) {
    const cat = translateCategory(item.category ?? 'other', lang)
    if (!grouped[cat]) grouped[cat] = []
    const qty =
      item.quantity > 1
        ? `${item.quantity} ${item.unit ? translateUnit(item.unit, lang) : ''}`
        : ''
    grouped[cat].push(qty ? `• ${item.name} (${qty.trim()})` : `• ${item.name}`)
  }
  let categoryBlocks = ''
  for (const [category, lines] of Object.entries(grouped)) {
    categoryBlocks += `*${category}*\n${lines.join('\n')}\n\n`
  }
  return categoryBlocks
}

export function sendListMessage(
  lang: Lang,
  params: SendListMessageParams
): string {
  const header = templates.sendListHeader[lang](params.planTitle)
  if (params.emptyList) {
    return (header + templates.sendListEmpty[lang]).trim()
  }
  return (header + params.categoryBlocks).trim()
}

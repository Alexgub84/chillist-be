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

interface SendListMessageParams {
  planTitle: string
  categoryBlocks: string
  emptyList: boolean
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

export function translateCategory(category: string, lang: Lang): string {
  return categoryTranslations[category]?.[lang] ?? category
}

export function translateUnit(unit: string, lang: Lang): string {
  return unitTranslations[unit]?.[lang] ?? unit
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

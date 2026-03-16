import { describe, it, expect } from 'vitest'
import {
  formatItemList,
  resolvePlanTitle,
  resolveLanguage,
  sendListMessage,
  inviteMessage,
  joinRequestMessage,
  joinRequestApprovedMessage,
  joinRequestRejectedMessage,
  translateCategory,
  translateUnit,
} from '../../../src/services/whatsapp/messages.js'

describe('formatItemList', () => {
  it('returns empty string for empty items array', () => {
    expect(formatItemList([], 'en')).toBe('')
    expect(formatItemList([], 'he')).toBe('')
  })

  it('groups items by translated category', () => {
    const items = [
      { name: 'Tent', quantity: 1, unit: 'pcs', category: 'equipment' },
      { name: 'Sleeping Bag', quantity: 2, unit: 'pcs', category: 'equipment' },
      { name: 'Burgers', quantity: 5, unit: 'kg', category: 'food' },
    ]
    const result = formatItemList(items, 'en')
    expect(result).toContain('*Equipment*')
    expect(result).toContain('*Food*')
    expect(result).toContain('• Tent')
    expect(result).toContain('• Sleeping Bag (2 pcs)')
    expect(result).toContain('• Burgers (5 kg)')
  })

  it('translates categories and units for Hebrew', () => {
    const items = [
      { name: 'אוהל', quantity: 2, unit: 'pcs', category: 'equipment' },
      { name: 'המבורגר', quantity: 3, unit: 'kg', category: 'food' },
    ]
    const result = formatItemList(items, 'he')
    expect(result).toContain('*ציוד*')
    expect(result).toContain('*אוכל*')
    expect(result).toContain('(2 יח׳)')
    expect(result).toContain('(3 ק"ג)')
  })

  it('omits quantity/unit when quantity is 1', () => {
    const items = [
      { name: 'Tent', quantity: 1, unit: 'pcs', category: 'equipment' },
    ]
    const result = formatItemList(items, 'en')
    expect(result).toBe('*Equipment*\n• Tent\n\n')
  })

  it('handles null category as raw string', () => {
    const items = [{ name: 'Mystery', quantity: 1, unit: null, category: null }]
    const result = formatItemList(items, 'en')
    expect(result).toContain('*other*')
    expect(result).toContain('• Mystery')
  })

  it('handles null unit with quantity > 1', () => {
    const items = [
      { name: 'Stuff', quantity: 3, unit: null, category: 'equipment' },
    ]
    const result = formatItemList(items, 'en')
    expect(result).toContain('• Stuff (3)')
  })

  it('handles unknown category as raw string', () => {
    const items = [
      { name: 'Widget', quantity: 1, unit: 'pcs', category: 'custom_cat' },
    ]
    const result = formatItemList(items, 'en')
    expect(result).toContain('*custom_cat*')
  })
})

describe('resolvePlanTitle', () => {
  it('returns title when provided', () => {
    expect(resolvePlanTitle('Beach BBQ', 'en')).toBe('Beach BBQ')
    expect(resolvePlanTitle('Beach BBQ', 'he')).toBe('Beach BBQ')
  })

  it('returns English fallback for null title', () => {
    expect(resolvePlanTitle(null, 'en')).toBe('Untitled Plan')
  })

  it('returns Hebrew fallback for null title', () => {
    expect(resolvePlanTitle(null, 'he')).toBe('תוכנית ללא שם')
  })

  it('returns fallback for undefined title', () => {
    expect(resolvePlanTitle(undefined, 'en')).toBe('Untitled Plan')
  })
})

describe('resolveLanguage', () => {
  it('returns he for Hebrew', () => {
    expect(resolveLanguage('he')).toBe('he')
  })

  it('returns en for anything else', () => {
    expect(resolveLanguage('en')).toBe('en')
    expect(resolveLanguage(null)).toBe('en')
    expect(resolveLanguage(undefined)).toBe('en')
    expect(resolveLanguage('fr')).toBe('en')
  })
})

describe('sendListMessage', () => {
  it('builds message with header and category blocks', () => {
    const msg = sendListMessage('en', {
      planTitle: 'Trip',
      categoryBlocks: '*Food*\n• Burgers\n\n',
      emptyList: false,
    })
    expect(msg).toContain('📋 *Trip*')
    expect(msg).toContain('*Food*')
    expect(msg).toContain('• Burgers')
  })

  it('builds empty list message', () => {
    const msg = sendListMessage('en', {
      planTitle: 'Trip',
      categoryBlocks: '',
      emptyList: true,
    })
    expect(msg).toContain('📋 *Trip*')
    expect(msg).toContain('No items yet')
  })

  it('builds Hebrew empty list message', () => {
    const msg = sendListMessage('he', {
      planTitle: 'טיול',
      categoryBlocks: '',
      emptyList: true,
    })
    expect(msg).toContain('אין פריטים עדיין')
  })
})

describe('inviteMessage', () => {
  it('includes plan title and deep link (en)', () => {
    const msg = inviteMessage('en', {
      planTitle: 'BBQ',
      deepLink: 'https://example.com/invite',
    })
    expect(msg).toContain('BBQ')
    expect(msg).toContain('https://example.com/invite')
    expect(msg).toContain('invited')
  })

  it('includes plan title and deep link (he)', () => {
    const msg = inviteMessage('he', {
      planTitle: 'מסיבה',
      deepLink: 'https://example.com/invite',
    })
    expect(msg).toContain('מסיבה')
    expect(msg).toContain('הוזמנת')
  })
})

describe('joinRequestMessage', () => {
  it('includes requester name, plan title and link', () => {
    const msg = joinRequestMessage('en', {
      requesterName: 'John Doe',
      planTitle: 'Camping',
      deepLink: 'https://example.com/requests',
    })
    expect(msg).toContain('John Doe')
    expect(msg).toContain('Camping')
    expect(msg).toContain('join')
  })
})

describe('joinRequestApprovedMessage', () => {
  it('includes plan title and link', () => {
    const msg = joinRequestApprovedMessage('en', {
      planTitle: 'Camping',
      deepLink: 'https://example.com/plan',
    })
    expect(msg).toContain('approved')
    expect(msg).toContain('Camping')
  })

  it('Hebrew version', () => {
    const msg = joinRequestApprovedMessage('he', {
      planTitle: 'קמפינג',
      deepLink: 'https://example.com/plan',
    })
    expect(msg).toContain('אושרה')
    expect(msg).toContain('קמפינג')
  })
})

describe('joinRequestRejectedMessage', () => {
  it('includes plan title (en)', () => {
    const msg = joinRequestRejectedMessage('en', { planTitle: 'Camping' })
    expect(msg).toContain('Camping')
    expect(msg).toContain('not approved')
  })

  it('includes plan title (he)', () => {
    const msg = joinRequestRejectedMessage('he', { planTitle: 'קמפינג' })
    expect(msg).toContain('קמפינג')
    expect(msg).toContain('לא אושרה')
  })
})

describe('translateCategory', () => {
  it('translates known categories', () => {
    expect(translateCategory('food', 'en')).toBe('Food')
    expect(translateCategory('food', 'he')).toBe('אוכל')
    expect(translateCategory('equipment', 'en')).toBe('Equipment')
  })

  it('returns raw string for unknown categories', () => {
    expect(translateCategory('mystery', 'en')).toBe('mystery')
  })
})

describe('translateUnit', () => {
  it('translates known units', () => {
    expect(translateUnit('kg', 'en')).toBe('kg')
    expect(translateUnit('kg', 'he')).toBe('ק"ג')
    expect(translateUnit('pcs', 'he')).toBe('יח׳')
  })

  it('returns raw string for unknown units', () => {
    expect(translateUnit('bushel', 'en')).toBe('bushel')
  })
})

import { describe, it, expect } from 'vitest'
import { normalizePhone } from '../../src/utils/phone.js'

describe('normalizePhone', () => {
  it('passes through a clean E.164 number unchanged', () => {
    expect(normalizePhone('+972501234567')).toBe('+972501234567')
  })

  it('adds + prefix when missing', () => {
    expect(normalizePhone('972501234567')).toBe('+972501234567')
  })

  it('strips spaces', () => {
    expect(normalizePhone('+972 50 123 4567')).toBe('+972501234567')
  })

  it('strips dashes', () => {
    expect(normalizePhone('+972-50-123-4567')).toBe('+972501234567')
  })

  it('strips parentheses', () => {
    expect(normalizePhone('(972) 501234567')).toBe('+972501234567')
  })

  it('strips mixed spaces, dashes, and parens', () => {
    expect(normalizePhone('(972) 50-123 4567')).toBe('+972501234567')
  })

  it('adds + even when number has no prefix at all', () => {
    expect(normalizePhone('15550001234')).toBe('+15550001234')
  })

  it('does not double the + prefix', () => {
    expect(normalizePhone('++972501234567')).toBe('++972501234567')
  })

  it.each([
    ['+972501234567', '+972501234567'],
    ['972501234567', '+972501234567'],
    ['+972 50 123 4567', '+972501234567'],
    ['+972-50-123-4567', '+972501234567'],
    ['(972) 50 1234567', '+972501234567'],
    ['+1 (555) 000-1234', '+15550001234'],
  ])('normalizes %s to %s', (input, expected) => {
    expect(normalizePhone(input)).toBe(expected)
  })
})

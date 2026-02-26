import { describe, it, expect } from 'vitest'
import { buildIdentityFields } from '../../src/services/profile-sync.js'
import type { JwtUser } from '../../src/plugins/auth.js'

describe('buildIdentityFields', () => {
  it('returns all identity fields when user has full metadata', () => {
    const user: JwtUser = {
      id: 'abc',
      email: 'bob@example.com',
      role: 'authenticated',
      firstName: 'Bob',
      lastName: 'Smith',
      phone: '+1-555-000-0001',
      avatarUrl: 'https://example.com/avatar.jpg',
    }

    const fields = buildIdentityFields(user)

    expect(fields).toEqual({
      name: 'Bob',
      lastName: 'Smith',
      contactEmail: 'bob@example.com',
      contactPhone: '+1-555-000-0001',
      avatarUrl: 'https://example.com/avatar.jpg',
    })
  })

  it('returns only email when no user_metadata fields present', () => {
    const user: JwtUser = {
      id: 'abc',
      email: 'test@example.com',
      role: 'authenticated',
    }

    const fields = buildIdentityFields(user)

    expect(fields).toEqual({ contactEmail: 'test@example.com' })
  })

  it('returns empty object when email is also empty', () => {
    const user: JwtUser = {
      id: 'abc',
      email: '',
      role: 'authenticated',
    }

    const fields = buildIdentityFields(user)

    expect(fields).toEqual({})
  })

  it('includes partial fields when only some metadata exists', () => {
    const user: JwtUser = {
      id: 'abc',
      email: 'test@example.com',
      role: 'authenticated',
      firstName: 'Alice',
    }

    const fields = buildIdentityFields(user)

    expect(fields).toEqual({
      name: 'Alice',
      contactEmail: 'test@example.com',
    })
  })
})

interface NameMetadata {
  first_name?: string
  last_name?: string
  full_name?: string
  name?: string
}

export function parseNameFromMetadata(metadata: NameMetadata): {
  firstName?: string
  lastName?: string
} {
  if (metadata.first_name || metadata.last_name) {
    return {
      ...(metadata.first_name && { firstName: metadata.first_name }),
      ...(metadata.last_name && { lastName: metadata.last_name }),
    }
  }

  const fullName = metadata.full_name || metadata.name
  if (!fullName) return {}

  const spaceIndex = fullName.indexOf(' ')
  if (spaceIndex > 0) {
    return {
      firstName: fullName.slice(0, spaceIndex),
      lastName: fullName.slice(spaceIndex + 1),
    }
  }

  return { firstName: fullName }
}

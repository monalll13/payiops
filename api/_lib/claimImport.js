const HASH_MARKER = '#sha256='

export function hasMeaningfulClaimRow(row) {
  return Object.values(row || {}).some((value) => String(value ?? '').trim() !== '')
}

export function sourceFileRef(fileName, fileHash) {
  const name = String(fileName || '').trim()
  const hash = String(fileHash || '').trim().toLowerCase()
  return hash ? `${name}${HASH_MARKER}${hash}` : name
}

export function sourceFileName(ref) {
  return String(ref || '').split(HASH_MARKER, 1)[0]
}

export function sourceFileHash(ref) {
  const value = String(ref || '')
  const index = value.lastIndexOf(HASH_MARKER)
  return index < 0 ? '' : value.slice(index + HASH_MARKER.length).toLowerCase()
}

export function findDuplicateImport(existing, { fileName, fileHash, importId }) {
  const hash = String(fileHash || '').trim().toLowerCase()
  return (existing || []).find((row) => {
    if (String(row.import_id || '') === String(importId || '')) return false
    if (hash) {
      const storedHash = sourceFileHash(row.source_file)
      return storedHash ? storedHash === hash : sourceFileName(row.source_file) === String(fileName || '').trim()
    }
    return !sourceFileHash(row.source_file) && sourceFileName(row.source_file) === String(fileName || '').trim()
  }) || null
}

export function calculateClaimRate(claims, outgoingUnits, mappingCoverage = 100) {
  const count = Number(claims || 0)
  const outgoing = Number(outgoingUnits || 0)
  if (Number(mappingCoverage) !== 100 || outgoing <= 0) return null
  return Math.round((count / outgoing) * 10000) / 100
}

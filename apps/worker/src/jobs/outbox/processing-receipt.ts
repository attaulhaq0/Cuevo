type ReceiptOutcome = 'COMPLETED' | 'WAITING' | 'REQUIRES_REVIEW' | 'PROCESSING_RECEIPT_UNKNOWN';
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const object = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const exactKeys = (value: Record<string, unknown>, keys: string[]) => Object.keys(value).sort().join('|') === keys.sort().join('|');

/** Only current canonical SQL receipts confirm processing; a resolved query can have committed before a malformed response. */
export function processingReceiptOutcome(result: unknown): ReceiptOutcome {
  if (!object(result)) return 'PROCESSING_RECEIPT_UNKNOWN';
  const rows: unknown = result.rows;
  if (!Array.isArray(rows) || rows.length !== 1 || !object(rows[0]) || !exactKeys(rows[0], ['process_learner_event'])) return 'PROCESSING_RECEIPT_UNKNOWN';
  const receipt: unknown = rows[0].process_learner_event;
  if (!object(receipt)) return 'PROCESSING_RECEIPT_UNKNOWN';
  switch (receipt.status) {
    case 'PROCESSED':
      return exactKeys(receipt, ['status', 'learnerId']) && typeof receipt.learnerId === 'string' && uuid.test(receipt.learnerId) ? 'COMPLETED' : 'PROCESSING_RECEIPT_UNKNOWN';
    case 'AWARDED':
      return exactKeys(receipt, ['status', 'awards']) && typeof receipt.awards === 'number' && Number.isSafeInteger(receipt.awards) && receipt.awards >= 0 ? 'COMPLETED' : 'PROCESSING_RECEIPT_UNKNOWN';
    case 'ACKNOWLEDGED_DISABLED':
      return exactKeys(receipt, ['status', 'awards']) && receipt.awards === 0 ? 'COMPLETED' : 'PROCESSING_RECEIPT_UNKNOWN';
    case 'ACKNOWLEDGED':
    case 'DUPLICATE':
    case 'DUPLICATE_SOURCE':
    case 'COMPLETED':
    case 'PLANNED':
    case 'REFRESHED':
    case 'NO_SOURCE':
    case 'SUPERSEDED':
      return exactKeys(receipt, ['status']) ? 'COMPLETED' : 'PROCESSING_RECEIPT_UNKNOWN';
    case 'WAITING':
    case 'REQUIRES_REVIEW':
      return exactKeys(receipt, ['status']) ? receipt.status : 'PROCESSING_RECEIPT_UNKNOWN';
    default:
      return 'PROCESSING_RECEIPT_UNKNOWN';
  }
}

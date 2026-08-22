// ZATCA (Saudi Zakat, Tax and Customs Authority) Phase-1 "simplified tax
// invoice" QR payload — 5 TLV (Tag-Length-Value) fields, concatenated and
// Base64-encoded, per ZATCA's e-invoicing generation-phase spec:
//   1) Seller name
//   2) Seller VAT registration number
//   3) Invoice timestamp (ISO 8601)
//   4) Invoice total, VAT-inclusive
//   5) VAT total
// This covers Phase 1 (unsigned QR); it does not include the Phase 2
// cryptographic stamp, which requires a ZATCA-issued device certificate.
function tlvField(tag: number, value: string): number[] {
  const bytes = Array.from(new TextEncoder().encode(value));
  return [tag, bytes.length, ...bytes];
}

export function buildZatcaQrPayload(params: {
  sellerName: string;
  vatNumber: string;
  timestamp: string;
  totalWithVat: number;
  vatAmount: number;
}): string {
  const bytes = [
    ...tlvField(1, params.sellerName),
    ...tlvField(2, params.vatNumber),
    ...tlvField(3, params.timestamp),
    ...tlvField(4, params.totalWithVat.toFixed(2)),
    ...tlvField(5, params.vatAmount.toFixed(2)),
  ];
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

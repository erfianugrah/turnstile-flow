const DEFAULT_JA4_BUCKET = 'ANY';
const DEFAULT_ASN_BUCKET = -1;

type FingerprintType = 'header' | 'tls';

function normalizeJa4(ja4?: string | null): string {
	return ja4 && ja4.trim().length > 0 ? ja4.trim() : DEFAULT_JA4_BUCKET;
}

function normalizeAsn(asn?: number | null): number {
	return typeof asn === 'number' && Number.isFinite(asn) ? asn : DEFAULT_ASN_BUCKET;
}

export async function recordFingerprintBaseline(
	db: D1Database,
	type: FingerprintType,
	fingerprintKey: string,
	ja4?: string | null,
	asn?: number | null,
	metadata?: Record<string, any>
): Promise<void> {
	if (!fingerprintKey) {
		return;
	}

	const ja4Bucket = normalizeJa4(ja4);
	const asnBucket = normalizeAsn(asn);

	const metadataJson = metadata ? JSON.stringify(metadata) : null;

	await db
		.prepare(
			`INSERT INTO fingerprint_baselines (type, fingerprint_key, ja4_bucket, asn_bucket, hit_count, metadata)
			 VALUES (?, ?, ?, ?, 1, ?)
			 ON CONFLICT(type, fingerprint_key, ja4_bucket, asn_bucket)
			 DO UPDATE SET hit_count = hit_count + 1, last_seen = CURRENT_TIMESTAMP`
		)
		.bind(type, fingerprintKey, ja4Bucket, asnBucket, metadataJson)
		.run();
}

export async function isFingerprintBaselineKnown(
	db: D1Database,
	type: FingerprintType,
	fingerprintKey?: string | null,
	ja4?: string | null,
	asn?: number | null
): Promise<boolean> {
	if (!fingerprintKey) {
		return false;
	}

	const ja4Bucket = normalizeJa4(ja4);
	const asnBucket = normalizeAsn(asn);

	const row = await db
		.prepare(
			`SELECT hit_count
			 FROM fingerprint_baselines
			 WHERE type = ? AND fingerprint_key = ? AND ja4_bucket = ? AND asn_bucket = ?
			 LIMIT 1`
		)
		.bind(type, fingerprintKey, ja4Bucket, asnBucket)
		.first<{ hit_count: number }>();

	return !!row;
}

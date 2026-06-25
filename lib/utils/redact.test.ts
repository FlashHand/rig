import { redactParamsStr, maskSecret } from './redact';

// Realistic-length fakes so the head+tail masking path is exercised.
const FAKE_AK = 'LTAI5tFakeAccessKeyId000000';
const FAKE_AS = 'FakeAccessKeySecret9876543210ZZ';

describe('redactParamsStr', () => {
	const params = `ak=${FAKE_AK}&as=${FAKE_AS}&bucket=mm-sg-public&region=oss-ap-southeast-1`;
	const out = redactParamsStr(params);

	it('never emits the raw AccessKey ID or Secret', () => {
		expect(out).not.toContain(FAKE_AK);
		expect(out).not.toContain(FAKE_AS);
	});

	it('fully redacts the AccessKey secret (as)', () => {
		expect(out).toContain('as=****');
		// no fragment of the secret leaks (head or tail)
		expect(out).not.toContain(FAKE_AS.slice(0, 4));
		expect(out).not.toContain(FAKE_AS.slice(-4));
	});

	it('keeps a head+tail hint for the AccessKey ID (ak)', () => {
		expect(out).toContain(`ak=${maskSecret(FAKE_AK)}`);
		expect(out).toContain('LTAI'); // head hint retained for debuggability
	});

	it('passes non-credential params through unchanged', () => {
		expect(out).toContain('bucket=mm-sg-public');
		expect(out).toContain('region=oss-ap-southeast-1');
	});

	it('masks long-alias credential keys too', () => {
		const aliased = redactParamsStr(`access_key=${FAKE_AK}&access_secret=${FAKE_AS}`);
		expect(aliased).not.toContain(FAKE_AK);
		expect(aliased).not.toContain(FAKE_AS);
		expect(aliased).toContain('access_secret=****');
	});

	it('handles empty / nullish input', () => {
		expect(redactParamsStr('')).toBe('');
		expect(redactParamsStr(undefined)).toBe('');
		expect(redactParamsStr(null)).toBe('');
	});
});

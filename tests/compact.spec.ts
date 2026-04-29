import {
	stripAvatarUrls,
	summariseLongArrays,
	SUMMARY_MIN_LENGTH,
	SUMMARY_SAMPLE_SIZE,
} from '../src/tools/util/compact';

describe('stripAvatarUrls', () => {
	it('drops profilePic / avatarUrl / photoUrl at any depth', () => {
		const input = {
			id: 'u1',
			name: 'Peter',
			profilePic: 'https://cloudinary/...',
			reports: [
				{ id: 'u2', avatarUrl: 'https://cloudinary/...', name: 'A' },
				{ id: 'u3', photoUrl: 'https://cloudinary/...', name: 'B' },
			],
			nested: { deeplyNested: { avatar: 'https://cloudinary/...', kept: true } },
		};
		const out = stripAvatarUrls(input);
		expect(out).toEqual({
			id: 'u1',
			name: 'Peter',
			reports: [
				{ id: 'u2', name: 'A' },
				{ id: 'u3', name: 'B' },
			],
			nested: { deeplyNested: { kept: true } },
		});
	});

	it('returns primitives unchanged', () => {
		expect(stripAvatarUrls('hello')).toBe('hello');
		expect(stripAvatarUrls(42)).toBe(42);
		expect(stripAvatarUrls(null)).toBe(null);
	});

	it('does not mutate the input', () => {
		const input = { profilePic: 'x', keep: 1 };
		stripAvatarUrls(input);
		expect(input.profilePic).toBe('x');
	});
});

describe('summariseLongArrays', () => {
	it('collapses arrays >= SUMMARY_MIN_LENGTH to { count, sample, truncated }', () => {
		const arr = Array.from({ length: SUMMARY_MIN_LENGTH }, (_, i) => ({ i }));
		const out = summariseLongArrays(arr) as unknown as {
			count: number;
			sample: unknown[];
			truncated: boolean;
		};
		expect(out.count).toBe(SUMMARY_MIN_LENGTH);
		expect(out.sample).toHaveLength(SUMMARY_SAMPLE_SIZE);
		expect(out.truncated).toBe(true);
	});

	it('leaves arrays shorter than the threshold untouched (but recurses)', () => {
		const arr = [{ inner: Array.from({ length: 25 }, (_, i) => i) }];
		const out = summariseLongArrays(arr) as unknown as Array<{
			inner: { count: number; sample: unknown[]; truncated: boolean };
		}>;
		expect(out).toHaveLength(1);
		expect(out[0]!.inner.count).toBe(25);
		expect(out[0]!.inner.truncated).toBe(true);
	});

	it('recurses into objects', () => {
		const input = {
			headline: 5,
			items: Array.from({ length: 30 }, (_, i) => ({ id: i })),
		};
		const out = summariseLongArrays(input) as unknown as {
			headline: number;
			items: { count: number };
		};
		expect(out.headline).toBe(5);
		expect(out.items.count).toBe(30);
	});

	it('leaves primitives alone', () => {
		expect(summariseLongArrays(5)).toBe(5);
		expect(summariseLongArrays('x')).toBe('x');
	});
});

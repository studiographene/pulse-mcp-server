/**
 * Regression cover for the FTP cross-pollination guard (PX-3685).
 *
 * Under concurrent load the Pulse BE leaks per-request context: a member's
 * FTP response can carry sprints from projects they aren't on. The MCP
 * compares response project names against the names pulled from the
 * member's profile and throws when an unexpected project appears.
 */

import { findUnexpectedFtpProjects } from '../src/tools/activity';

describe('findUnexpectedFtpProjects', () => {
	const okResponse = {
		data: {
			graphData: [
				{ projectName: 'Drive Fuze', sprintName: 'Sprint 5.3' },
				{ projectName: 'Drive Fuze', sprintName: 'Sprint 5.2' },
				{ projectName: '59Club - Surveys', sprintName: 'CLUB59 - Sprint 24' },
			],
		},
	};

	it('returns [] when every response project is on the expected list', () => {
		expect(
			findUnexpectedFtpProjects(okResponse, ['Drive Fuze', '59Club - Surveys'])
		).toEqual([]);
	});

	it('tolerates punctuation drift between profile and graphData', () => {
		// Profile says "Locaria (T&M)", FTP graphData says "Locaria T&M".
		const drifted = {
			data: { graphData: [{ projectName: 'Locaria T&M', sprintName: 'Sprint 1' }] },
		};
		expect(findUnexpectedFtpProjects(drifted, ['Locaria (T&M)'])).toEqual([]);
	});

	it('flags every unexpected project name when pollution leaks in', () => {
		// Catarina's actual projects are Drive Fuze + 59Club. The polluted
		// response contains Telsen sprints — exactly the PX-3685 symptom.
		const polluted = {
			data: {
				graphData: [
					{ projectName: 'Telsen', sprintName: 'v7.8.0' },
					{ projectName: 'Telsen', sprintName: 'v7.7.0' },
					{ projectName: 'Drive Fuze', sprintName: 'Sprint 5.3' },
				],
			},
		};
		expect(
			findUnexpectedFtpProjects(polluted, ['Drive Fuze', '59Club - Surveys'])
		).toEqual(['Telsen']);
	});

	it('skips validation when the caller supplied projectIds explicitly (no expected names)', () => {
		// Caller passed projectIds[] directly so we never resolved names from
		// the profile. Returning [] (= no error) is the right behaviour: we
		// can't validate without the lookup, and false-positives would be worse
		// than letting the rare pollution through.
		expect(findUnexpectedFtpProjects(okResponse, [])).toEqual([]);
	});

	it('handles empty / missing graphData without throwing', () => {
		expect(findUnexpectedFtpProjects({}, ['Drive Fuze'])).toEqual([]);
		expect(findUnexpectedFtpProjects({ data: {} }, ['Drive Fuze'])).toEqual([]);
		expect(
			findUnexpectedFtpProjects({ data: { graphData: [] } }, ['Drive Fuze'])
		).toEqual([]);
	});
});

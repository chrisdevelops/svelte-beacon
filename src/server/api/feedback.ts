import { route, json } from '../router.js';

route('POST', '/feedback', async () => {
	return json(
		{ error: 'Feedback submission not yet implemented' },
		{ status: 501 },
	);
});

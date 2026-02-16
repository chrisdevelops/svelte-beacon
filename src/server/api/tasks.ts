import { route, json } from '../router.js';

route('GET', '/tasks', async () => {
	return json({
		items: [],
		pagination: {
			page: 1,
			limit: 50,
			total: 0,
			totalPages: 0,
		},
	});
});

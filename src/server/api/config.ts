import { route, json } from '../router.js';

route('GET', '/config', async (_event, _db, config) => {
	return json({
		widget: config.widget,
		mode: config.mode,
	});
});

export interface BeaconOptions {
	/** Enable or disable Beacon entirely. When false, the hook is a pure passthrough. */
	enabled: boolean;
	/** Operating mode. 'development' skips auth; 'deployed' requires it. */
	mode: 'development' | 'deployed';
	/** Database connection URL. Defaults to 'file:.beacon/beacon.db'. */
	database?: string;
	/** Auth token for Turso connections. */
	databaseAuthToken?: string;
	/** Emails that get admin privileges in deployed mode. */
	adminEmails?: string[];
	/** Widget configuration overrides. */
	widget?: Partial<WidgetConfig>;
	/** AI configuration. */
	ai?: Partial<AIConfig>;
}

export interface WidgetConfig {
	/** Enable screenshot capture. Default: true in dev, false in deployed. */
	screenshot: boolean;
	/** Enable element selector. Default: true in dev, true in deployed. */
	elementSelector: boolean;
	/** Enable AI-assisted description. Default: true if API key provided. */
	aiAssist: boolean;
	/** Require email for feedback submission. Default: false in dev, configurable in deployed. */
	requireEmail: boolean;
	/** Widget position. Default: 'bottom-right'. */
	position: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
}

export interface AIConfig {
	/** Anthropic API key for Layer 1 (widget assist). */
	anthropicApiKey?: string;
	/** Maximum duration for Layer 2 agent tasks in minutes. Default: 30. */
	maxDurationMinutes: number;
	/** Require tests for bug-type tasks. Default: true. */
	requireTestsForBugs: boolean;
	/** Automatically create PRs on agent completion. Default: false. */
	createPR: boolean;
}

export interface ResolvedConfig {
	enabled: boolean;
	mode: 'development' | 'deployed';
	database: string;
	databaseAuthToken?: string;
	requireAuth: boolean;
	adminEmails: string[];
	widget: WidgetConfig;
	ai: AIConfig;
}

const DEVELOPMENT_DEFAULTS: Omit<ResolvedConfig, 'enabled' | 'mode' | 'database' | 'databaseAuthToken' | 'adminEmails'> = {
	requireAuth: false,
	widget: {
		screenshot: true,
		elementSelector: true,
		aiAssist: true,
		requireEmail: false,
		position: 'bottom-right',
	},
	ai: {
		maxDurationMinutes: 30,
		requireTestsForBugs: true,
		createPR: false,
	},
};

const DEPLOYED_DEFAULTS: Omit<ResolvedConfig, 'enabled' | 'mode' | 'database' | 'databaseAuthToken' | 'adminEmails'> = {
	requireAuth: true,
	widget: {
		screenshot: false,
		elementSelector: true,
		aiAssist: false,
		requireEmail: false,
		position: 'bottom-right',
	},
	ai: {
		maxDurationMinutes: 30,
		requireTestsForBugs: true,
		createPR: false,
	},
};

export function resolveConfig(options: BeaconOptions): ResolvedConfig {
	const defaults = options.mode === 'development' ? DEVELOPMENT_DEFAULTS : DEPLOYED_DEFAULTS;

	return {
		enabled: options.enabled,
		mode: options.mode,
		database: options.database ?? 'file:.beacon/beacon.db',
		databaseAuthToken: options.databaseAuthToken,
		requireAuth: defaults.requireAuth,
		adminEmails: options.adminEmails ?? [],
		widget: {
			...defaults.widget,
			...options.widget,
			// If API key is provided and aiAssist wasn't explicitly set, enable it
			aiAssist: options.widget?.aiAssist ?? (options.ai?.anthropicApiKey ? true : defaults.widget.aiAssist),
		},
		ai: {
			...defaults.ai,
			...options.ai,
		},
	};
}

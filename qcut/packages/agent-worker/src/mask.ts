/**
 * Best-effort secret masking for log lines before they're written to
 * agent_events. Inspired by vm0's guest-agent/src/masker.rs — match the
 * shapes of the worst-class leaks (provider API keys, JWTs, AWS access
 * keys) and replace with "***".
 *
 * This is not a security boundary — a determined adversary can defeat
 * any regex masker. It catches the common operational footgun of a
 * pipeline accidentally echoing its key.
 *
 * @module @qcut/agent-worker/mask
 */

const SECRET_PATTERNS: RegExp[] = [
	/sk-[A-Za-z0-9_-]{20,}/g, // OpenAI / Anthropic
	/xoxb-[A-Za-z0-9_-]+/g, // Slack
	/xoxp-[A-Za-z0-9_-]+/g,
	/AKIA[0-9A-Z]{16}/g, // AWS access key
	/ghp_[A-Za-z0-9]{30,}/g, // GitHub PAT
	/glpat-[A-Za-z0-9_-]{20,}/g, // GitLab PAT
	/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, // JWT
	/sbp_[a-f0-9]{40}/g, // Supabase PAT
];

export function mask(line: string): string {
	let out = line;
	for (const p of SECRET_PATTERNS) out = out.replace(p, "***");
	return out;
}

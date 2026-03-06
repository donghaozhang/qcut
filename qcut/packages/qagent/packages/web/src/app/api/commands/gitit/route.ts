import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { type NextRequest, NextResponse } from "next/server";
import { validateString } from "@/lib/validation";
import { getServices } from "@/lib/services";

/** POST /api/commands/gitit — Read gitit.md and send it to a session */
export async function POST(request: NextRequest) {
	const body = (await request.json().catch(() => null)) as Record<
		string,
		unknown
	> | null;

	const sessionId = String(body?.sessionId ?? "");
	const idErr = validateString(sessionId, "sessionId", 256);
	if (idErr) {
		return NextResponse.json({ error: idErr }, { status: 400 });
	}

	try {
		const { config, sessionManager } = await getServices();

		// Resolve gitit.md relative to the repo root (dirname of qagent.yaml)
		const repoRoot = dirname(config.configPath);
		const gitItPath = join(repoRoot, ".claude", "commands", "gitit.md");
		const instruction = readFileSync(gitItPath, "utf-8").trim();

		if (!instruction) {
			return NextResponse.json(
				{ error: "gitit.md is empty" },
				{ status: 422 }
			);
		}

		await sessionManager.send(sessionId, instruction);
		return NextResponse.json({ ok: true, sessionId });
	} catch (err) {
		const msg =
			err instanceof Error ? err.message : "Failed to send gitit instruction";
		const status =
			msg.includes("not found") || msg.includes("ENOENT") ? 404 : 500;
		return NextResponse.json({ error: msg }, { status });
	}
}

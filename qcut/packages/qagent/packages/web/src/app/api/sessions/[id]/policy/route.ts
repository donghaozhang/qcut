import { NextResponse, type NextRequest } from "next/server";
import {
	evaluatePolicyGate,
	loadWorkflowContract,
	resolveEffectiveWorkflowPolicy,
	type SCM,
} from "@composio/ao-core";
import { getServices } from "@/lib/services";
import type { DashboardPolicyGate } from "@/lib/types";

/**
 * GET /api/sessions/[id]/policy
 *
 * Returns live policy gate evaluation for a session.
 * - 404 if session not found
 * - 200 with DashboardPolicyGate if session has a PR and SCM configured
 * - 200 with passed=true and empty violations if no PR / no SCM
 */
export async function GET(
	_request: NextRequest,
	{ params }: { params: Promise<{ id: string }> }
) {
	try {
		const { id } = await params;
		const { config, registry, sessionManager } = await getServices();

		const session = await sessionManager.get(id);
		if (!session) {
			return NextResponse.json({ error: "Session not found" }, { status: 404 });
		}

		// No PR — gate trivially passes (nothing to block)
		if (!session.pr) {
			const result: DashboardPolicyGate = {
				passed: true,
				mode: "advisory",
				violations: [],
				checkedAt: new Date().toISOString(),
			};
			return NextResponse.json(result);
		}

		const project = config.projects[session.projectId];
		if (!project?.scm) {
			const result: DashboardPolicyGate = {
				passed: true,
				mode: "advisory",
				violations: [],
				checkedAt: new Date().toISOString(),
			};
			return NextResponse.json(result);
		}

		const scm = registry.get<SCM>("scm", project.scm.plugin);
		if (!scm) {
			return NextResponse.json(
				{ error: "SCM plugin not configured" },
				{ status: 503 }
			);
		}

		const workflowContract = loadWorkflowContract({ config, project });
		const effectivePolicy = resolveEffectiveWorkflowPolicy({
			config,
			project,
			contract: workflowContract,
		});

		const gateResult = await evaluatePolicyGate({
			scm,
			pr: session.pr,
			mode: effectivePolicy.mode,
			policy: effectivePolicy.policy,
		});

		const result: DashboardPolicyGate = {
			passed: gateResult.passed,
			mode: gateResult.mode,
			violations: gateResult.violations.map((v) => ({
				code: v.code,
				message: v.message,
				blockerClass: v.blockerClass,
			})),
			failingChecks: gateResult.requiredChecks
				.filter((c) => !c.passed)
				.map((c) => c.name),
			checkedAt: gateResult.checkedAt.toISOString(),
		};

		return NextResponse.json(result);
	} catch (error) {
		console.error("[/api/sessions/[id]/policy] error:", error);
		return NextResponse.json(
			{ error: "Failed to evaluate policy gate" },
			{ status: 500 }
		);
	}
}

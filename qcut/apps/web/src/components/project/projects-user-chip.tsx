import { Link } from "@tanstack/react-router";
import { LogIn } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { useLicenseStore } from "@/stores/license-store";
import { useTranslation } from "@/lib/i18n";

/**
 * User identity block for the studio top bar: avatar (with account
 * dropdown), display name, and plan badge. Falls back to a sign-in
 * link when no user is attached to the license.
 */
export function ProjectsUserChip() {
	const license = useLicenseStore((s) => s.license);
	const { t } = useTranslation();
	const user = license?.user;

	if (!user) {
		return (
			<Link
				to="/login"
				className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
			>
				<LogIn className="size-4" />
				<span>{t("projects.signIn")}</span>
			</Link>
		);
	}

	return (
		<div className="flex items-center gap-2.5" data-testid="projects-user-chip">
			<UserAvatar user={user} />
			<div className="hidden sm:flex flex-col leading-tight">
				<span className="text-sm font-medium max-w-40 truncate">
					{user.name}
				</span>
				<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
					{license.plan}
				</span>
			</div>
		</div>
	);
}

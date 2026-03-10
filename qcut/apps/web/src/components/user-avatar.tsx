import { platform } from "@qcut/platform-core";
import { useCallback } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";
import { useLicenseStore } from "@/stores/license-store";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { LogOut } from "lucide-react";

interface UserAvatarProps {
	user: { name: string; email: string; image: string | null };
	isDark?: boolean;
}

function getInitials(name: string): string {
	return name
		.split(" ")
		.map((w) => w[0])
		.join("")
		.toUpperCase()
		.slice(0, 2);
}

export function UserAvatar({ user, isDark }: UserAvatarProps) {
	const navigate = useNavigate();
	const clearLicense = useLicenseStore((s) => s.clearLicense);

	const handleLogout = useCallback(async () => {
		try {
			const licenseApi = platform().license;
			if (licenseApi) {
				await licenseApi.clearAuthToken();
			}
		} catch {
			// Non-critical
		}
		clearLicense();
		navigate({ to: "/" });
	}, [clearLicense, navigate]);

	return (
		<DropdownMenu>
			<DropdownMenuTrigger asChild>
				<button type="button" className="rounded-full focus:outline-none">
					<Avatar className="h-7 w-7 cursor-pointer">
						{user.image && (
							<AvatarImage
								src={user.image}
								alt={user.name}
								referrerPolicy="no-referrer"
							/>
						)}
						<AvatarFallback
							className={`text-xs font-medium ${isDark ? "bg-neutral-700 text-white" : ""}`}
						>
							{getInitials(user.name)}
						</AvatarFallback>
					</Avatar>
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-56">
				<DropdownMenuLabel className="font-normal">
					<div className="flex flex-col gap-1">
						<p className="text-sm font-medium">{user.name}</p>
						<p className="text-xs text-muted-foreground">{user.email}</p>
					</div>
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem onClick={handleLogout}>
					<LogOut className="mr-2 h-4 w-4" />
					Sign out
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

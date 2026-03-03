export const keys = () => ({
	NODE_ENV:
		(process.env.NODE_ENV as "development" | "production" | "test") ||
		"development",
	DATABASE_URL: process.env.DATABASE_URL || "",
});

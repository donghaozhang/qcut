import { and, eq, isNull, lt, or, type SQL } from "drizzle-orm";
import Stripe from "stripe";
import { db } from "@qcut/db";
import { licenses, stripeWebhookEvents } from "@qcut/db/schema";
import {
	addTopUpPackCreditsForUser,
	downgradeToFreeCreditsForUser,
	isTopUpPack,
	reconcileTopUpRefundByStripePaymentId,
	resetPlanCreditsForUser,
} from "./credit-service";
import { getLicenseByUserId, updateLicense } from "./license-service";
import {
	getPaymentCancelUrl,
	getPaymentPortalReturnUrl,
	getPaymentSuccessUrl,
	resolveStripeIdempotencyKey,
} from "./payment-config";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "");
const WEBHOOK_LOCK_STALE_MS = 5 * 60 * 1000;

const WEBHOOK_LOCK_RESULT = {
	acquired: "acquired",
	alreadyProcessed: "already_processed",
	inProgress: "in_progress",
} as const;

type WebhookLockResult =
	(typeof WEBHOOK_LOCK_RESULT)[keyof typeof WEBHOOK_LOCK_RESULT];

const SUBSCRIPTION_PRICE_IDS: Record<string, string> = {
	pro_month: process.env.STRIPE_PRO_MONTHLY_PRICE_ID || "",
	pro_year: process.env.STRIPE_PRO_YEARLY_PRICE_ID || "",
	team_month: process.env.STRIPE_TEAM_MONTHLY_PRICE_ID || "",
	team_year: process.env.STRIPE_TEAM_YEARLY_PRICE_ID || "",
};

const TOP_UP_PRICE_IDS: Record<string, string> = {
	starter: process.env.STRIPE_TOPUP_STARTER_PRICE_ID || "",
	standard: process.env.STRIPE_TOPUP_STANDARD_PRICE_ID || "",
	pro: process.env.STRIPE_TOPUP_PRO_PRICE_ID || "",
	mega: process.env.STRIPE_TOPUP_MEGA_PRICE_ID || "",
};

const SUBSCRIPTION_PRICE_TO_PLAN: Record<string, "pro" | "team"> = {
	[SUBSCRIPTION_PRICE_IDS.pro_month]: "pro",
	[SUBSCRIPTION_PRICE_IDS.pro_year]: "pro",
	[SUBSCRIPTION_PRICE_IDS.team_month]: "team",
	[SUBSCRIPTION_PRICE_IDS.team_year]: "team",
};

const SUBSCRIPTION_STATUS_TO_LICENSE: Record<
	Stripe.Subscription.Status,
	"active" | "past_due" | "cancelled" | "expired"
> = {
	active: "active",
	trialing: "active",
	past_due: "past_due",
	canceled: "cancelled",
	incomplete: "past_due",
	incomplete_expired: "expired",
	unpaid: "past_due",
	paused: "past_due",
};

function resolveLicenseStatus({
	status,
}: {
	status: Stripe.Subscription.Status;
}): "active" | "past_due" | "cancelled" | "expired" {
	return SUBSCRIPTION_STATUS_TO_LICENSE[status] ?? "past_due";
}

function resolvePlanFromPriceId({
	priceId,
}: {
	priceId?: string | null;
}): "pro" | "team" | null {
	if (!priceId) {
		return null;
	}
	return SUBSCRIPTION_PRICE_TO_PLAN[priceId] ?? null;
}

function getMaxDevicesForPlan({
	plan,
}: {
	plan: "free" | "pro" | "team";
}): number {
	if (plan === "team") {
		return 10;
	}
	if (plan === "pro") {
		return 3;
	}
	return 1;
}

function assertConfiguredPriceId({
	priceId,
	errorMessage,
}: {
	priceId: string;
	errorMessage: string;
}): void {
	if (priceId.length === 0) {
		throw new Error(errorMessage);
	}
}

async function findLicenseByStripeIds({
	customerId,
	subscriptionId,
}: {
	customerId?: string;
	subscriptionId?: string;
}): Promise<typeof licenses.$inferSelect | null> {
	try {
		if (!customerId && !subscriptionId) {
			return null;
		}

		const predicates: SQL[] = [];
		if (customerId) {
			predicates.push(eq(licenses.stripeCustomerId, customerId));
		}
		if (subscriptionId) {
			predicates.push(eq(licenses.stripeSubscriptionId, subscriptionId));
		}

		if (predicates.length === 0) {
			return null;
		}

		const [license] = await db
			.select()
			.from(licenses)
			.where(or(...predicates))
			.limit(1);

		return license ?? null;
	} catch (error) {
		throw new Error(
			`Failed to find license by Stripe IDs: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

async function acquireWebhookEventLock({
	eventId,
	eventType,
}: {
	eventId: string;
	eventType: string;
}): Promise<WebhookLockResult> {
	try {
		const now = new Date();
		const [inserted] = await db
			.insert(stripeWebhookEvents)
			.values({
				id: crypto.randomUUID(),
				eventId,
				eventType,
				processedAt: null,
				lastError: null,
				createdAt: now,
				updatedAt: now,
			})
			.onConflictDoNothing({ target: stripeWebhookEvents.eventId })
			.returning({ id: stripeWebhookEvents.id });

		if (inserted) {
			return WEBHOOK_LOCK_RESULT.acquired;
		}

		const [existing] = await db
			.select({
				processedAt: stripeWebhookEvents.processedAt,
			})
			.from(stripeWebhookEvents)
			.where(eq(stripeWebhookEvents.eventId, eventId))
			.limit(1);

		if (existing?.processedAt) {
			return WEBHOOK_LOCK_RESULT.alreadyProcessed;
		}

		const staleThreshold = new Date(now.getTime() - WEBHOOK_LOCK_STALE_MS);
		const [reclaimed] = await db
			.update(stripeWebhookEvents)
			.set({
				eventType,
				lastError: null,
				updatedAt: now,
			})
			.where(
				and(
					eq(stripeWebhookEvents.eventId, eventId),
					isNull(stripeWebhookEvents.processedAt),
					lt(stripeWebhookEvents.updatedAt, staleThreshold)
				)
			)
			.returning({ id: stripeWebhookEvents.id });

		if (reclaimed) {
			return WEBHOOK_LOCK_RESULT.acquired;
		}

		return WEBHOOK_LOCK_RESULT.inProgress;
	} catch (error) {
		throw new Error(
			`Failed to acquire webhook lock for ${eventId}: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

async function markWebhookEventProcessed({
	eventId,
}: {
	eventId: string;
}): Promise<void> {
	try {
		const now = new Date();
		const [updated] = await db
			.update(stripeWebhookEvents)
			.set({
				processedAt: now,
				lastError: null,
				updatedAt: now,
			})
			.where(eq(stripeWebhookEvents.eventId, eventId))
			.returning({ id: stripeWebhookEvents.id });

		if (!updated) {
			throw new Error("No webhook lock row found to mark processed");
		}
	} catch (error) {
		throw new Error(
			`Failed to mark webhook event ${eventId} as processed: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

async function releaseWebhookEventLock({
	eventId,
	errorMessage,
}: {
	eventId: string;
	errorMessage: string;
}): Promise<void> {
	try {
		const now = new Date();
		await db
			.update(stripeWebhookEvents)
			.set({
				lastError: errorMessage,
				updatedAt: now,
			})
			.where(
				and(
					eq(stripeWebhookEvents.eventId, eventId),
					isNull(stripeWebhookEvents.processedAt)
				)
			);
	} catch (releaseError) {
		console.error(
			`[Stripe] Failed to release webhook lock for ${eventId}: ${
				releaseError instanceof Error ? releaseError.message : "Unknown error"
			}; original error: ${errorMessage}`
		);
	}
}

export async function createCheckoutSession({
	userId,
	plan,
	interval,
	idempotencyKey,
}: {
	userId: string;
	plan: "pro" | "team";
	interval: "month" | "year";
	idempotencyKey?: string;
}): Promise<Stripe.Checkout.Session> {
	try {
		const priceId = SUBSCRIPTION_PRICE_IDS[`${plan}_${interval}`];
		assertConfiguredPriceId({
			priceId,
			errorMessage: `Missing Stripe price ID for ${plan}/${interval}`,
		});

		const resolvedIdempotencyKey = resolveStripeIdempotencyKey({
			providedKey: idempotencyKey,
			scope: "checkout",
			ownerId: userId,
			payloadParts: [plan, interval],
		});

		return await stripe.checkout.sessions.create(
			{
				mode: "subscription",
				payment_method_types: ["card"],
				line_items: [{ price: priceId, quantity: 1 }],
				success_url: getPaymentSuccessUrl({ type: "subscription" }),
				cancel_url: getPaymentCancelUrl({ type: "subscription" }),
				metadata: {
					type: "subscription",
					userId,
					plan,
					interval,
				},
			},
			{ idempotencyKey: resolvedIdempotencyKey }
		);
	} catch (error) {
		throw new Error(
			`Failed to create subscription checkout session: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

export async function createTopUpCheckoutSession({
	userId,
	pack,
	idempotencyKey,
}: {
	userId: string;
	pack: "starter" | "standard" | "pro" | "mega";
	idempotencyKey?: string;
}): Promise<Stripe.Checkout.Session> {
	try {
		const priceId = TOP_UP_PRICE_IDS[pack];
		assertConfiguredPriceId({
			priceId,
			errorMessage: `Missing Stripe top-up price ID for pack ${pack}`,
		});

		const resolvedIdempotencyKey = resolveStripeIdempotencyKey({
			providedKey: idempotencyKey,
			scope: "topup",
			ownerId: userId,
			payloadParts: [pack],
		});

		return await stripe.checkout.sessions.create(
			{
				mode: "payment",
				payment_method_types: ["card"],
				line_items: [{ price: priceId, quantity: 1 }],
				success_url: getPaymentSuccessUrl({ type: "topup" }),
				cancel_url: getPaymentCancelUrl({ type: "topup" }),
				metadata: {
					type: "topup",
					userId,
					pack,
				},
			},
			{ idempotencyKey: resolvedIdempotencyKey }
		);
	} catch (error) {
		throw new Error(
			`Failed to create top-up checkout session: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

export async function createPortalSession({
	stripeCustomerId,
	idempotencyKey,
}: {
	stripeCustomerId: string;
	idempotencyKey?: string;
}): Promise<Stripe.BillingPortal.Session> {
	try {
		const resolvedIdempotencyKey = resolveStripeIdempotencyKey({
			providedKey: idempotencyKey,
			scope: "portal",
			ownerId: stripeCustomerId,
			payloadParts: ["billing-portal"],
		});

		return await stripe.billingPortal.sessions.create(
			{
				customer: stripeCustomerId,
				return_url: getPaymentPortalReturnUrl(),
			},
			{ idempotencyKey: resolvedIdempotencyKey }
		);
	} catch (error) {
		throw new Error(
			`Failed to create portal session: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

async function handleCheckoutCompleted({
	session,
}: {
	session: Stripe.Checkout.Session;
}): Promise<void> {
	try {
		const userId = session.metadata?.userId;
		const type = session.metadata?.type;
		if (!userId || !type) {
			return;
		}

		if (type === "topup") {
			const pack = session.metadata?.pack || "";
			if (!isTopUpPack(pack)) {
				throw new Error(`Invalid top-up pack metadata: ${pack}`);
			}
			await addTopUpPackCreditsForUser({
				userId,
				pack,
				stripePaymentId:
					typeof session.payment_intent === "string"
						? session.payment_intent
						: session.id,
			});
			return;
		}

		if (type === "subscription") {
			const plan = session.metadata?.plan;
			if (plan !== "pro" && plan !== "team") {
				throw new Error(`Invalid subscription plan metadata: ${plan}`);
			}

			const license = await getLicenseByUserId({ userId });
			await updateLicense({
				licenseId: license.id,
				updates: {
					plan,
					status: "active",
					stripeCustomerId:
						typeof session.customer === "string"
							? session.customer
							: license.stripeCustomerId,
					stripeSubscriptionId:
						typeof session.subscription === "string"
							? session.subscription
							: license.stripeSubscriptionId,
					maxDevices: getMaxDevicesForPlan({ plan }),
				},
			});

			await resetPlanCreditsForUser({
				userId,
				plan,
				stripePaymentId: session.id,
				description: `Subscription checkout completed (${plan})`,
			});
		}
	} catch (error) {
		throw new Error(
			`Failed to process checkout.session.completed webhook: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

async function handleSubscriptionUpdated({
	subscription,
}: {
	subscription: Stripe.Subscription;
}): Promise<void> {
	try {
		const customerId =
			typeof subscription.customer === "string"
				? subscription.customer
				: undefined;
		const subscriptionId = subscription.id;
		const license = await findLicenseByStripeIds({
			customerId,
			subscriptionId,
		});
		if (!license) {
			return;
		}

		const priceId = subscription.items.data[0]?.price?.id;
		const inferredPlan = resolvePlanFromPriceId({ priceId }) ?? license.plan;
		const status = resolveLicenseStatus({ status: subscription.status });
		const currentPeriodEnd =
			typeof subscription.current_period_end === "number"
				? new Date(subscription.current_period_end * 1000)
				: license.currentPeriodEnd;

		await updateLicense({
			licenseId: license.id,
			updates: {
				plan: inferredPlan,
				status,
				currentPeriodEnd,
				maxDevices: getMaxDevicesForPlan({ plan: inferredPlan }),
				stripeCustomerId: customerId ?? license.stripeCustomerId,
				stripeSubscriptionId: subscriptionId,
			},
		});
	} catch (error) {
		throw new Error(
			`Failed to process customer.subscription.updated webhook: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

async function handleSubscriptionDeleted({
	subscription,
}: {
	subscription: Stripe.Subscription;
}): Promise<void> {
	try {
		const customerId =
			typeof subscription.customer === "string"
				? subscription.customer
				: undefined;
		const license = await findLicenseByStripeIds({
			customerId,
			subscriptionId: subscription.id,
		});
		if (!license) {
			return;
		}

		await updateLicense({
			licenseId: license.id,
			updates: {
				plan: "free",
				status: "cancelled",
				maxDevices: 1,
				stripeSubscriptionId: null,
			},
		});

		await downgradeToFreeCreditsForUser({
			userId: license.userId,
			description: "Subscription cancelled - downgraded to free credits",
		});
	} catch (error) {
		throw new Error(
			`Failed to process customer.subscription.deleted webhook: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

async function handleInvoicePaymentSucceeded({
	invoice,
}: {
	invoice: Stripe.Invoice;
}): Promise<void> {
	try {
		const subscriptionId =
			typeof invoice.subscription === "string"
				? invoice.subscription
				: undefined;
		const customerId =
			typeof invoice.customer === "string" ? invoice.customer : undefined;
		const license = await findLicenseByStripeIds({
			customerId,
			subscriptionId,
		});
		if (!license) {
			return;
		}

		await resetPlanCreditsForUser({
			userId: license.userId,
			plan: license.plan,
			stripePaymentId: invoice.id,
			description: "Monthly subscription renewal credits",
		});
	} catch (error) {
		throw new Error(
			`Failed to process invoice.payment_succeeded webhook: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

async function handleInvoicePaymentFailed({
	invoice,
}: {
	invoice: Stripe.Invoice;
}): Promise<void> {
	try {
		const subscriptionId =
			typeof invoice.subscription === "string"
				? invoice.subscription
				: undefined;
		const customerId =
			typeof invoice.customer === "string" ? invoice.customer : undefined;
		const license = await findLicenseByStripeIds({
			customerId,
			subscriptionId,
		});
		if (!license) {
			return;
		}

		await updateLicense({
			licenseId: license.id,
			updates: { status: "past_due" },
		});
	} catch (error) {
		throw new Error(
			`Failed to process invoice.payment_failed webhook: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

async function handleChargeRefunded({
	charge,
}: {
	charge: Stripe.Charge;
}): Promise<void> {
	try {
		const paymentIntentId =
			typeof charge.payment_intent === "string"
				? charge.payment_intent
				: undefined;
		if (!paymentIntentId) {
			return;
		}

		await reconcileTopUpRefundByStripePaymentId({
			stripePaymentId: paymentIntentId,
			chargeAmount: charge.amount,
			chargeRefundedAmount: charge.amount_refunded,
		});
	} catch (error) {
		throw new Error(
			`Failed to process charge.refunded webhook: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

export async function handleWebhook({
	body,
	signature,
}: {
	body: string;
	signature: string;
}): Promise<{ received: true }> {
	try {
		const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
		if (!webhookSecret) {
			throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
		}

		const event = stripe.webhooks.constructEvent(
			body,
			signature,
			webhookSecret
		);
		const lockResult = await acquireWebhookEventLock({
			eventId: event.id,
			eventType: event.type,
		});
		if (lockResult === WEBHOOK_LOCK_RESULT.alreadyProcessed) {
			return { received: true };
		}
		if (lockResult === WEBHOOK_LOCK_RESULT.inProgress) {
			throw new Error(`Webhook event ${event.id} is currently processing`);
		}

		try {
			switch (event.type) {
				case "checkout.session.completed":
					await handleCheckoutCompleted({
						session: event.data.object as Stripe.Checkout.Session,
					});
					break;
				case "customer.subscription.updated":
					await handleSubscriptionUpdated({
						subscription: event.data.object as Stripe.Subscription,
					});
					break;
				case "customer.subscription.deleted":
					await handleSubscriptionDeleted({
						subscription: event.data.object as Stripe.Subscription,
					});
					break;
				case "invoice.payment_succeeded":
					await handleInvoicePaymentSucceeded({
						invoice: event.data.object as Stripe.Invoice,
					});
					break;
					case "invoice.payment_failed":
						await handleInvoicePaymentFailed({
							invoice: event.data.object as Stripe.Invoice,
						});
						break;
					case "charge.refunded":
						await handleChargeRefunded({
							charge: event.data.object as Stripe.Charge,
						});
						break;
					default:
						break;
				}

			await markWebhookEventProcessed({ eventId: event.id });
			return { received: true };
		} catch (processingError) {
			await releaseWebhookEventLock({
				eventId: event.id,
				errorMessage:
					processingError instanceof Error
						? processingError.message
						: "Unknown processing error",
			});
			throw processingError;
		}
	} catch (error) {
		throw new Error(
			`Stripe webhook handling failed: ${error instanceof Error ? error.message : "Unknown error"}`
		);
	}
}

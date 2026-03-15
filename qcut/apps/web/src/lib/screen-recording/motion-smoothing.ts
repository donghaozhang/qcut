/** Spring physics model for cursor motion smoothing. */

export interface SpringState {
	value: number;
	velocity: number;
	initialized: boolean;
}

export interface SpringConfig {
	stiffness: number;
	damping: number;
	mass: number;
}

/**
 * Map a smoothing factor (0–2) to spring config.
 * 0 → near-instant, 0.18 → natural, 0.5 → smooth, 2.0 → ultra-smooth
 */
export function getCursorSpringConfig(smoothingFactor: number): SpringConfig {
	// Interpolate stiffness from 1000 (instant) to 160 (ultra-smooth)
	const clamped = Math.max(0, Math.min(2, smoothingFactor));
	const stiffness = 1000 - clamped * 420;
	const damping = 2 * Math.sqrt(stiffness); // Critical damping
	return { stiffness, damping, mass: 1 };
}

/**
 * Step the spring physics forward by dt seconds.
 * Returns updated spring state.
 */
export function stepSpring(
	state: SpringState,
	target: number,
	config: SpringConfig,
	dt: number
): SpringState {
	if (!state.initialized) {
		return { value: target, velocity: 0, initialized: true };
	}

	// Semi-implicit Euler integration
	const displacement = state.value - target;
	const springForce = -config.stiffness * displacement;
	const dampingForce = -config.damping * state.velocity;
	const acceleration = (springForce + dampingForce) / config.mass;

	const newVelocity = state.velocity + acceleration * dt;
	const newValue = state.value + newVelocity * dt;

	return { value: newValue, velocity: newVelocity, initialized: true };
}

export function createSpringState(): SpringState {
	return { value: 0, velocity: 0, initialized: false };
}

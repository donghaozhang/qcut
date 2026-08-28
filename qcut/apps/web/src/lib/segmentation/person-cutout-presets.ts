import type { PersonCutoutMaskOptions } from "./person-cutout-mask";

export const BASIC_PERSON_CUTOUT_SETTINGS: PersonCutoutMaskOptions = {
	threshold: 0.5,
	temporalSmoothing: 0.65,
	edgeShift: 0,
	feather: 2,
};

export const FINE_PERSON_CUTOUT_SETTINGS: PersonCutoutMaskOptions = {
	threshold: 0.5,
	temporalSmoothing: 0,
	edgeShift: 0,
	feather: 0,
};

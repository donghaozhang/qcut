import { mkdir } from "node:fs/promises";
import path from "node:path";

interface AudioDefinition {
	id: string;
	duration: number;
	expression: string;
	filter?: string;
}

const DEFINITIONS: AudioDefinition[] = [
	{
		id: "soft-click",
		duration: 0.32,
		expression: "0.24*sin(2*PI*1700*t)*exp(-28*t)+0.06*random(0)*exp(-42*t)",
	},
	{
		id: "bright-notification",
		duration: 0.9,
		expression:
			"0.16*sin(2*PI*880*t)*exp(-4.5*t)+0.12*sin(2*PI*1320*t)*exp(-3.8*t)",
	},
	{
		id: "cinematic-impact",
		duration: 1.6,
		expression:
			"0.4*sin(2*PI*(72*t-18*t*t))*exp(-3.1*t)+0.1*random(0)*exp(-10*t)",
		filter: "lowpass=f=5200",
	},
	{
		id: "air-whoosh",
		duration: 1.4,
		expression:
			"0.2*random(0)*pow(sin(PI*t/1.4),2)+0.05*sin(2*PI*(220*t+780*t*t))*pow(sin(PI*t/1.4),2)",
		filter: "highpass=f=180,lowpass=f=6800",
	},
	{
		id: "camera-shutter",
		duration: 0.5,
		expression:
			"0.16*random(0)*exp(-38*t)+0.12*sin(2*PI*120*t)*exp(-18*t)+0.08*sin(2*PI*2100*t)*exp(-55*t)",
	},
	{
		id: "digital-sparkle",
		duration: 1.2,
		expression:
			"0.09*sin(2*PI*1046.5*t)*exp(-3.8*t)+0.08*sin(2*PI*1568*t)*exp(-3.2*t)+0.06*sin(2*PI*2093*t)*exp(-2.7*t)",
	},
	{
		id: "button-pop",
		duration: 0.25,
		expression: "0.2*sin(2*PI*(520*t+950*t*t))*exp(-15*t)",
	},
	{
		id: "soft-footstep",
		duration: 0.7,
		expression: "0.22*random(0)*exp(-14*t)+0.18*sin(2*PI*88*t)*exp(-8*t)",
		filter: "lowpass=f=1800",
	},
	{
		id: "page-turn",
		duration: 0.8,
		expression: "0.14*random(0)*pow(sin(PI*t/0.8),2)",
		filter: "highpass=f=420,lowpass=f=7200",
	},
	{
		id: "reverse-sweep",
		duration: 1.2,
		expression:
			"0.16*random(0)*pow(t/1.2,2)+0.05*sin(2*PI*(180*t+920*t*t))*pow(t/1.2,2)",
		filter: "highpass=f=220,lowpass=f=7600",
	},
	{
		id: "heavy-drop",
		duration: 1.5,
		expression:
			"0.42*sin(2*PI*(64*t-14*t*t))*exp(-2.7*t)+0.12*random(0)*exp(-8*t)",
		filter: "lowpass=f=4600",
	},
	{
		id: "rain-window",
		duration: 8,
		expression:
			"0.065*random(0)+0.018*sin(2*PI*4200*t)*pow(abs(sin(PI*1.7*t)),18)",
		filter: "highpass=f=260,lowpass=f=6800",
	},
	{
		id: "forest-morning",
		duration: 8,
		expression:
			"0.025*random(0)+0.045*sin(2*PI*(1260*t+80*t*t))*pow(abs(sin(PI*0.7*t)),24)+0.03*sin(2*PI*1680*t)*pow(abs(sin(PI*0.43*t)),28)",
		filter: "highpass=f=180,lowpass=f=7200",
	},
	{
		id: "quiet-room-tone",
		duration: 8,
		expression: "0.025*random(0)+0.018*sin(2*PI*58*t)",
		filter: "highpass=f=32,lowpass=f=1600",
	},
	{
		id: "quiet-current",
		duration: 12,
		expression:
			"0.055*sin(2*PI*130.81*t)+0.045*sin(2*PI*196*t)+0.04*sin(2*PI*261.63*t)+0.018*sin(2*PI*392*t)*(0.35+0.65*pow(abs(sin(PI*t/2)),4))",
		filter: "lowpass=f=4200,aecho=0.8:0.7:320|640:0.18|0.08",
	},
	{
		id: "neon-steps",
		duration: 12,
		expression:
			"0.09*sin(2*PI*82.41*t)*pow(abs(sin(PI*2*t)),10)+0.055*sin(2*PI*329.63*t)*(0.3+0.7*pow(abs(sin(PI*4*t)),12))+0.025*random(0)*pow(abs(sin(PI*8*t)),30)",
		filter: "highpass=f=42,lowpass=f=9000",
	},
	{
		id: "warm-window",
		duration: 12,
		expression:
			"0.06*sin(2*PI*110*t)+0.045*sin(2*PI*220*t)+0.035*sin(2*PI*277.18*t)+0.05*sin(2*PI*440*t)*pow(abs(sin(PI*2*t)),14)",
		filter: "lowpass=f=5600,aecho=0.8:0.6:180|360:0.12|0.06",
	},
	{
		id: "open-road",
		duration: 12,
		expression:
			"0.075*sin(2*PI*98*t)*pow(abs(sin(PI*2*t)),8)+0.045*sin(2*PI*392*t)*(0.4+0.6*pow(abs(sin(PI*4*t)),10))+0.02*random(0)*pow(abs(sin(PI*8*t)),26)",
		filter: "highpass=f=48,lowpass=f=8200",
	},
	{
		id: "pop-prism",
		duration: 12,
		expression:
			"0.085*sin(2*PI*87.31*t)*pow(abs(sin(PI*2.1333*t)),9)+0.05*sin(2*PI*349.23*t)*(0.25+0.75*pow(abs(sin(PI*4.2667*t)),13))+0.022*random(0)*pow(abs(sin(PI*8.5333*t)),28)",
		filter: "highpass=f=45,lowpass=f=9200",
	},
	{
		id: "moonlit-farewell",
		duration: 12,
		expression:
			"0.055*sin(2*PI*110*t)+0.04*sin(2*PI*164.81*t)+0.035*sin(2*PI*220*t)+0.045*sin(2*PI*329.63*t)*pow(abs(sin(PI*1.2*t)),12)",
		filter: "lowpass=f=4800,aecho=0.8:0.65:280|560:0.16|0.08",
	},
	{
		id: "snow-lantern",
		duration: 12,
		expression:
			"0.045*sin(2*PI*130.81*t)+0.035*sin(2*PI*196*t)+0.03*sin(2*PI*261.63*t)+0.035*sin(2*PI*523.25*t)*pow(abs(sin(PI*1.4*t)),18)",
		filter: "lowpass=f=5200,aecho=0.8:0.7:360|720:0.15|0.07",
	},
	{
		id: "golden-hour-ride",
		duration: 12,
		expression:
			"0.072*sin(2*PI*98*t)*pow(abs(sin(PI*1.8*t)),8)+0.044*sin(2*PI*392*t)*(0.35+0.65*pow(abs(sin(PI*3.6*t)),10))+0.018*random(0)*pow(abs(sin(PI*7.2*t)),24)",
		filter: "highpass=f=48,lowpass=f=8000",
	},
	{
		id: "victory-frame",
		duration: 12,
		expression:
			"0.088*sin(2*PI*92.5*t)*pow(abs(sin(PI*2.0667*t)),10)+0.052*sin(2*PI*370*t)*(0.3+0.7*pow(abs(sin(PI*4.1333*t)),12))+0.022*random(0)*pow(abs(sin(PI*8.2667*t)),26)",
		filter: "highpass=f=46,lowpass=f=8800",
	},
];

const outputDirectory = path.resolve(
	import.meta.dir,
	"../public/audio/builtin"
);

async function generateAudio({ definition }: { definition: AudioDefinition }) {
	const fadeOutStart = Math.max(0, definition.duration - 0.04);
	const expression = definition.expression.replaceAll(",", "\\,");
	const filters = [
		definition.filter,
		"afade=t=in:st=0:d=0.02",
		`afade=t=out:st=${fadeOutStart}:d=0.04`,
		"alimiter=limit=0.92",
	]
		.filter(Boolean)
		.join(",");
	const outputPath = path.join(outputDirectory, `${definition.id}.ogg`);
	const process = Bun.spawn(
		[
			"ffmpeg",
			"-hide_banner",
			"-loglevel",
			"error",
			"-y",
			"-f",
			"lavfi",
			"-i",
			`aevalsrc=${expression}:s=44100:d=${definition.duration}`,
			"-af",
			filters,
			"-c:a",
			"libopus",
			"-b:a",
			definition.duration >= 10 ? "96k" : "72k",
			"-t",
			String(definition.duration),
			outputPath,
		],
		{ stderr: "pipe", stdout: "ignore" }
	);
	const exitCode = await process.exited;
	if (exitCode === 0) return;
	throw new Error(
		`Failed to generate ${definition.id}: ${await new Response(process.stderr).text()}`
	);
}

await mkdir(outputDirectory, { recursive: true });
await Promise.all(
	DEFINITIONS.map((definition) => generateAudio({ definition }))
);

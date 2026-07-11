import type { VideoColorSettings } from "./color-settings";

type ColorMatrix = [
	[number, number, number],
	[number, number, number],
	[number, number, number],
];

const REC709_TO_XYZ: ColorMatrix = [
	[0.4124564, 0.3575761, 0.1804375],
	[0.2126729, 0.7151522, 0.072175],
	[0.0193339, 0.119192, 0.9503041],
];
const XYZ_TO_REC709: ColorMatrix = [
	[3.2404542, -1.5371385, -0.4985314],
	[-0.969266, 1.8760108, 0.041556],
	[0.0556434, -0.2040259, 1.0572252],
];
const P3_TO_XYZ: ColorMatrix = [
	[0.4865709, 0.2656677, 0.1982173],
	[0.2289746, 0.6917385, 0.0792869],
	[0, 0.0451134, 1.0439444],
];
const XYZ_TO_P3: ColorMatrix = [
	[2.493497, -0.9313836, -0.4027108],
	[-0.829489, 1.762664, 0.0236247],
	[0.0358458, -0.0761724, 0.9568845],
];
const REC2020_TO_XYZ: ColorMatrix = [
	[0.636958, 0.1446169, 0.168881],
	[0.2627002, 0.6779981, 0.0593017],
	[0, 0.0280727, 1.0609851],
];
const XYZ_TO_REC2020: ColorMatrix = [
	[1.7166512, -0.3556708, -0.2533663],
	[-0.6666844, 1.6164812, 0.0157685],
	[0.0176399, -0.0427706, 0.9421031],
];
const ACESCG_TO_XYZ: ColorMatrix = [
	[0.6624542, 0.1340042, 0.1561877],
	[0.2722287, 0.6740818, 0.0536895],
	[-0.0055746, 0.0040607, 1.0103391],
];
const XYZ_TO_ACESCG: ColorMatrix = [
	[1.6410234, -0.3248033, -0.2364247],
	[-0.6636629, 1.6153316, 0.0167563],
	[0.0117219, -0.0082844, 0.9883949],
];

function multiplyMatrices({
	left,
	right,
}: {
	left: ColorMatrix;
	right: ColorMatrix;
}): ColorMatrix {
	return left.map((row, rowIndex) =>
		right[0].map(
			(_, columnIndex) =>
				row[0] * right[0][columnIndex] +
				row[1] * right[1][columnIndex] +
				row[2] * right[2][columnIndex]
		)
	) as ColorMatrix;
}

function inputToXyzMatrix({ space }: { space: string }): ColorMatrix {
	if (space === "display-p3") return P3_TO_XYZ;
	if (space === "rec2020" || space === "hlg" || space === "pq")
		return REC2020_TO_XYZ;
	return REC709_TO_XYZ;
}

function xyzToOutputMatrix({ space }: { space: string }): ColorMatrix {
	if (space === "display-p3") return XYZ_TO_P3;
	if (space === "rec2020" || space === "hlg" || space === "pq")
		return XYZ_TO_REC2020;
	return XYZ_TO_REC709;
}

function matrixFilter({ matrix }: { matrix: ColorMatrix }): string {
	const coefficient = ({ row, column }: { row: number; column: number }) =>
		Math.round(matrix[row][column] * 1_000_000) / 1_000_000;
	return (
		`colorchannelmixer=rr=${coefficient({ row: 0, column: 0 })}:` +
		`rg=${coefficient({ row: 0, column: 1 })}:rb=${coefficient({ row: 0, column: 2 })}:` +
		`gr=${coefficient({ row: 1, column: 0 })}:gg=${coefficient({ row: 1, column: 1 })}:` +
		`gb=${coefficient({ row: 1, column: 2 })}:br=${coefficient({ row: 2, column: 0 })}:` +
		`bg=${coefficient({ row: 2, column: 1 })}:bb=${coefficient({ row: 2, column: 2 })}`
	);
}

function decodeExpression({
	value,
	space,
	peakNits,
}: {
	value: string;
	space: string;
	peakNits: number;
}) {
	if (space === "logc3")
		return `clip((pow(10,((${value})-0.3855)/0.2472)-0.0523)/5.5556,0,1)`;
	if (space === "slog3")
		return `clip((pow(10,((${value})-0.6166)/0.255)-0.0376)/4.5,0,1)`;
	if (space === "vlog")
		return `clip((pow(10,((${value})-0.5982)/0.2415)-0.00873)/5.6,0,1)`;
	const hdrPeakScale = Math.max(1, peakNits) / 100;
	if (space === "pq") return `(pow(${value},2.4))*${hdrPeakScale}`;
	if (space === "hlg")
		return `(if(lte(${value},0.5),(${value})*(${value})/3,(exp(((${value})-0.5599)/0.1788)+0.2847)/12))*${hdrPeakScale}`;
	return `if(lte(${value},0.04045),(${value})/12.92,pow(((${value})+0.055)/1.055,2.4))`;
}

function encodeExpression({
	value,
	space,
	peakNits,
}: {
	value: string;
	space: string;
	peakNits: number;
}) {
	const hdrPeakScale = Math.max(1, peakNits) / 100;
	const hdrValue = `(max(0,${value})/${hdrPeakScale})`;
	if (space === "pq") return `pow(${hdrValue},1/2.4)`;
	if (space === "hlg")
		return `if(lte(${hdrValue},1/12),sqrt(3*${hdrValue}),0.1788*log(12*${hdrValue}-0.2847)+0.5599)`;
	return `if(lte(${value},0.0031308),(${value})*12.92,1.055*pow(max(0,${value}),1/2.4)-0.055)`;
}

function rgbLutExpressionFilter({
	expression,
}: {
	expression: ({ value }: { value: string }) => string;
}): string {
	const channel = `clip(255*(${expression({ value: "val/255" })}),0,255)`;
	return `lutrgb=r='${channel}':g='${channel}':b='${channel}'`;
}

function toneMapExpression({
	value,
	mode,
}: {
	value: string;
	mode: VideoColorSettings["management"]["toneMapping"];
}): string {
	if (mode === "reinhard") return `(${value})/(1+(${value}))`;
	if (mode === "hable")
		return `((${value})*(0.15*(${value})+0.05)+0.004)/((${value})*(0.15*(${value})+0.5)+0.06)-0.0667`;
	if (mode === "aces")
		return `((${value})*(2.51*(${value})+0.03))/((${value})*(2.43*(${value})+0.59)+0.14)`;
	return value;
}

export function buildColorManagementFilters({
	color,
}: {
	color: VideoColorSettings;
}): { input: string[]; output: string[] } {
	if (!color.management.enabled) return { input: [], output: [] };
	const workingFromXyz =
		color.management.workingSpace === "acescg" ? XYZ_TO_ACESCG : XYZ_TO_REC709;
	const workingToXyz =
		color.management.workingSpace === "acescg" ? ACESCG_TO_XYZ : REC709_TO_XYZ;
	const inputMatrix = multiplyMatrices({
		left: workingFromXyz,
		right: inputToXyzMatrix({ space: color.management.inputSpace }),
	});
	const outputMatrix = multiplyMatrices({
		left: xyzToOutputMatrix({ space: color.management.outputSpace }),
		right: workingToXyz,
	});
	const input = [
		rgbLutExpressionFilter({
			expression: ({ value }) =>
				decodeExpression({
					value,
					space: color.management.inputSpace,
					peakNits: color.management.peakNits,
				}),
		}),
		matrixFilter({ matrix: inputMatrix }),
	];
	const output: string[] = [];
	if (color.management.toneMapping !== "none") {
		output.push(
			rgbLutExpressionFilter({
				expression: ({ value }) =>
					toneMapExpression({
						value,
						mode: color.management.toneMapping,
					}),
			})
		);
	}
	output.push(
		matrixFilter({ matrix: outputMatrix }),
		rgbLutExpressionFilter({
			expression: ({ value }) =>
				encodeExpression({
					value,
					space: color.management.outputSpace,
					peakNits: color.management.peakNits,
				}),
		})
	);
	return { input, output };
}

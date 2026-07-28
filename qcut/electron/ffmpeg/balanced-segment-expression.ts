export function buildBalancedSegmentExpression({
	segmentCount,
	timeVariable,
	getBoundary,
	getSegmentExpression,
}: {
	segmentCount: number;
	timeVariable: string;
	getBoundary: ({ rightSegmentIndex }: { rightSegmentIndex: number }) => string;
	getSegmentExpression: ({ segmentIndex }: { segmentIndex: number }) => string;
}): string {
	if (!Number.isInteger(segmentCount) || segmentCount < 1) {
		throw new Error("A balanced expression needs at least one segment");
	}
	const buildRange = ({
		firstSegment,
		lastSegment,
	}: {
		firstSegment: number;
		lastSegment: number;
	}): string => {
		if (firstSegment === lastSegment) {
			return getSegmentExpression({ segmentIndex: firstSegment });
		}
		const middleSegment = Math.floor((firstSegment + lastSegment) / 2);
		const rightSegmentIndex = middleSegment + 1;
		return (
			`if(lt(${timeVariable},${getBoundary({ rightSegmentIndex })}),` +
			`${buildRange({
				firstSegment,
				lastSegment: middleSegment,
			})},${buildRange({
				firstSegment: rightSegmentIndex,
				lastSegment,
			})})`
		);
	};
	return buildRange({ firstSegment: 0, lastSegment: segmentCount - 1 });
}

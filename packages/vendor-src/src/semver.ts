export interface SemverParts {
	major: number;
	minor: number;
	patch: number;
	prerelease: Array<string | number>;
}

const semverPattern =
	/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;

export function parseSemver(version: string): SemverParts | undefined {
	const match = semverPattern.exec(version.trim());
	if (!match) {
		return undefined;
	}

	return {
		major: Number(match[1]),
		minor: Number(match[2]),
		patch: Number(match[3]),
		prerelease: match[4]
			? match[4]
					.split(".")
					.map((part) => (/^\d+$/.test(part) ? Number(part) : part))
			: [],
	};
}

function compareIdentifiers(
	left: string | number,
	right: string | number,
): number {
	const leftNumeric = typeof left === "number";
	const rightNumeric = typeof right === "number";

	if (leftNumeric && rightNumeric) {
		return left - right;
	}
	if (leftNumeric) {
		return -1;
	}
	if (rightNumeric) {
		return 1;
	}
	return String(left).localeCompare(String(right));
}

/** Compare two semver strings. Returns negative if a < b, 0 if equal, positive if a > b. */
export function compareSemver(a: string, b: string): number {
	const left = parseSemver(a);
	const right = parseSemver(b);

	if (!left && !right) {
		return a.localeCompare(b);
	}
	if (!left) {
		return -1;
	}
	if (!right) {
		return 1;
	}

	if (left.major !== right.major) {
		return left.major - right.major;
	}
	if (left.minor !== right.minor) {
		return left.minor - right.minor;
	}
	if (left.patch !== right.patch) {
		return left.patch - right.patch;
	}

	if (left.prerelease.length === 0 && right.prerelease.length === 0) {
		return 0;
	}
	if (left.prerelease.length === 0) {
		return 1;
	}
	if (right.prerelease.length === 0) {
		return -1;
	}

	const length = Math.max(left.prerelease.length, right.prerelease.length);
	for (let index = 0; index < length; index += 1) {
		const leftPart = left.prerelease[index];
		const rightPart = right.prerelease[index];
		if (leftPart === undefined) {
			return -1;
		}
		if (rightPart === undefined) {
			return 1;
		}
		const compared = compareIdentifiers(leftPart, rightPart);
		if (compared !== 0) {
			return compared;
		}
	}

	return 0;
}

export function maxSemver(versions: Iterable<string>): string | undefined {
	let max: string | undefined;
	for (const version of versions) {
		if (max === undefined || compareSemver(version, max) > 0) {
			max = version;
		}
	}
	return max;
}

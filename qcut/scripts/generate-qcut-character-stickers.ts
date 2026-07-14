import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
	CHARACTER_STICKER_PACKS,
	type CharacterStickerPack,
	type CharacterStickerPose,
} from "../apps/web/src/lib/stickers/sticker-character-packs";

const OUTPUT_ROOT = join(
	import.meta.dir,
	"../apps/web/public/stickers/qcut-original"
);

function escapeXml({ value }: { value: string }): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

function normalizeSvg({ value }: { value: string }): string {
	return `${value.replace(/[ \t]+$/gm, "").trim()}\n`;
}

function ears({ pack }: { pack: CharacterStickerPack }): string {
	const { body, inner, outline } = pack.palette;
	if (pack.species === "rabbit") {
		return `
			<g stroke-linejoin="round">
				<rect x="158" y="44" width="72" height="180" rx="36" fill="${body}" stroke="white" stroke-width="32" transform="rotate(-10 194 134)"/>
				<rect x="282" y="44" width="72" height="180" rx="36" fill="${body}" stroke="white" stroke-width="32" transform="rotate(10 318 134)"/>
				<rect x="158" y="44" width="72" height="180" rx="36" fill="${body}" stroke="${outline}" stroke-width="12" transform="rotate(-10 194 134)"/>
				<rect x="282" y="44" width="72" height="180" rx="36" fill="${body}" stroke="${outline}" stroke-width="12" transform="rotate(10 318 134)"/>
				<rect x="181" y="68" width="27" height="126" rx="14" fill="${inner}" transform="rotate(-10 194 134)"/>
				<rect x="304" y="68" width="27" height="126" rx="14" fill="${inner}" transform="rotate(10 318 134)"/>
			</g>`;
	}
	const earRadius = pack.species === "mouse" ? 69 : 54;
	const leftX = pack.species === "mouse" ? 158 : 174;
	const rightX = pack.species === "mouse" ? 354 : 338;
	return `
		<g>
			<circle cx="${leftX}" cy="168" r="${earRadius}" fill="${body}" stroke="white" stroke-width="32"/>
			<circle cx="${rightX}" cy="168" r="${earRadius}" fill="${body}" stroke="white" stroke-width="32"/>
			<circle cx="${leftX}" cy="168" r="${earRadius}" fill="${body}" stroke="${outline}" stroke-width="12"/>
			<circle cx="${rightX}" cy="168" r="${earRadius}" fill="${body}" stroke="${outline}" stroke-width="12"/>
			<circle cx="${leftX}" cy="168" r="${Math.round(earRadius * 0.56)}" fill="${inner}"/>
			<circle cx="${rightX}" cy="168" r="${Math.round(earRadius * 0.56)}" fill="${inner}"/>
		</g>`;
}

function eyeHeart({ x, color }: { x: number; color: string }): string {
	return `<path d="M ${x} 245 C ${x - 25} 224 ${x - 49} 254 ${x} 286 C ${x + 49} 254 ${x + 25} 224 ${x} 245 Z" fill="${color}"/>`;
}

function expression({
	pack,
	pose,
}: {
	pack: CharacterStickerPack;
	pose: CharacterStickerPose;
}): string {
	const { accent, outline } = pack.palette;
	if (pose.id === "love") {
		return `${eyeHeart({ x: 211, color: accent })}${eyeHeart({ x: 301, color: accent })}
			<path d="M 230 305 Q 256 328 282 305" fill="none" stroke="${outline}" stroke-width="10" stroke-linecap="round"/>`;
	}
	if (pose.id === "sleepy") {
		return `<path d="M 194 254 Q 214 238 234 254 M 278 254 Q 298 238 318 254" fill="none" stroke="${outline}" stroke-width="11" stroke-linecap="round"/>
			<path d="M 244 304 Q 256 296 268 304" fill="none" stroke="${outline}" stroke-width="9" stroke-linecap="round"/>`;
	}
	if (pose.id === "surprised") {
		return `<circle cx="214" cy="253" r="13" fill="${outline}"/><circle cx="298" cy="253" r="13" fill="${outline}"/>
			<ellipse cx="256" cy="310" rx="20" ry="26" fill="${outline}"/>`;
	}
	if (pose.id === "angry") {
		return `<path d="M 190 232 L 235 247 M 322 232 L 277 247" stroke="${outline}" stroke-width="12" stroke-linecap="round"/>
			<circle cx="216" cy="259" r="10" fill="${outline}"/><circle cx="296" cy="259" r="10" fill="${outline}"/>
			<path d="M 231 316 Q 256 294 281 316" fill="none" stroke="${outline}" stroke-width="10" stroke-linecap="round"/>`;
	}
	if (pose.id === "cry") {
		return `<path d="M 193 249 Q 214 232 235 249 M 277 249 Q 298 232 319 249" fill="none" stroke="${outline}" stroke-width="11" stroke-linecap="round"/>
			<path d="M 207 263 C 192 286 194 307 213 309 C 231 306 231 286 207 263 Z M 305 263 C 281 286 281 306 299 309 C 318 307 320 286 305 263 Z" fill="#58b9f4"/>
			<path d="M 232 326 Q 256 302 280 326" fill="none" stroke="${outline}" stroke-width="10" stroke-linecap="round"/>`;
	}
	if (pose.id === "selfie") {
		return `<path d="M 196 251 Q 214 268 232 251" fill="none" stroke="${outline}" stroke-width="11" stroke-linecap="round"/>
			<circle cx="299" cy="253" r="11" fill="${outline}"/>
			<path d="M 233 302 Q 256 326 279 302" fill="none" stroke="${outline}" stroke-width="10" stroke-linecap="round"/>`;
	}
	if (pose.id === "confused") {
		return `<circle cx="214" cy="253" r="11" fill="${outline}"/><circle cx="298" cy="253" r="11" fill="${outline}"/>
			<path d="M 235 313 Q 256 301 277 313" fill="none" stroke="${outline}" stroke-width="9" stroke-linecap="round"/>`;
	}
	if (pose.id === "shy") {
		return `<path d="M 194 254 Q 214 238 234 254 M 278 254 Q 298 238 318 254" fill="none" stroke="${outline}" stroke-width="11" stroke-linecap="round"/>
			<ellipse cx="182" cy="291" rx="31" ry="15" fill="${accent}" opacity="0.55"/><ellipse cx="330" cy="291" rx="31" ry="15" fill="${accent}" opacity="0.55"/>
			<path d="M 238 306 Q 256 320 274 306" fill="none" stroke="${outline}" stroke-width="9" stroke-linecap="round"/>`;
	}
	if (pose.id === "hungry") {
		return `<circle cx="214" cy="253" r="11" fill="${outline}"/><circle cx="298" cy="253" r="11" fill="${outline}"/>
			<ellipse cx="256" cy="308" rx="28" ry="19" fill="${outline}"/>`;
	}
	if (pose.id === "cool") {
		return `<path d="M 174 234 H 246 L 237 277 Q 210 294 183 270 Z M 266 234 H 338 L 329 270 Q 302 294 275 277 Z" fill="#293241" stroke="${outline}" stroke-width="8" stroke-linejoin="round"/>
			<path d="M 246 244 H 266" stroke="${outline}" stroke-width="9"/>
			<path d="M 232 309 Q 256 331 280 309" fill="none" stroke="${outline}" stroke-width="10" stroke-linecap="round"/>`;
	}
	if (pose.id === "no") {
		return `<path d="M 193 242 L 235 270 M 235 242 L 193 270 M 277 242 L 319 270 M 319 242 L 277 270" stroke="${outline}" stroke-width="10" stroke-linecap="round"/>
			<path d="M 231 320 Q 256 297 281 320" fill="none" stroke="${outline}" stroke-width="10" stroke-linecap="round"/>`;
	}
	return `<path d="M 193 250 Q 214 271 235 250 M 277 250 Q 298 271 319 250" fill="none" stroke="${outline}" stroke-width="11" stroke-linecap="round"/>
		<path d="M 226 300 Q 256 333 286 300" fill="none" stroke="${outline}" stroke-width="11" stroke-linecap="round"/>`;
}

function speciesDetails({ pack }: { pack: CharacterStickerPack }): string {
	const { inner, outline } = pack.palette;
	if (pack.species === "mouse") {
		return `<ellipse cx="256" cy="289" rx="42" ry="31" fill="${inner}"/>
			<path d="M 246 280 Q 256 270 266 280 Q 256 294 246 280 Z" fill="${outline}"/>
			<path d="M 174 281 L 108 266 M 174 300 L 104 303 M 338 281 L 404 266 M 338 300 L 408 303" stroke="${outline}" stroke-width="6" stroke-linecap="round"/>`;
	}
	if (pack.species === "bear") {
		return `<ellipse cx="256" cy="289" rx="49" ry="38" fill="${inner}"/>
			<ellipse cx="256" cy="280" rx="14" ry="11" fill="${outline}"/>`;
	}
	return `<path d="M 246 280 Q 256 270 266 280 Q 256 294 246 280 Z" fill="${outline}"/>
		<path d="M 256 289 L 256 304" stroke="${outline}" stroke-width="7" stroke-linecap="round"/>`;
}

function backProps({
	pack,
	pose,
}: {
	pack: CharacterStickerPack;
	pose: CharacterStickerPose;
}): string {
	const { accent, outline } = pack.palette;
	if (pose.id === "wave" || pose.id === "welcome") {
		return `<ellipse cx="389" cy="280" rx="39" ry="83" fill="${pack.palette.body}" stroke="white" stroke-width="28" transform="rotate(25 389 280)"/>
			<ellipse cx="389" cy="280" rx="39" ry="83" fill="${pack.palette.body}" stroke="${outline}" stroke-width="12" transform="rotate(25 389 280)"/>
			<path d="M 420 147 Q 448 164 455 194 M 397 136 Q 415 155 418 181" fill="none" stroke="${accent}" stroke-width="12" stroke-linecap="round"/>`;
	}
	if (pose.id === "cheer" || pose.id === "celebrate") {
		return `<path d="M 104 116 L 132 135 L 112 163 L 82 142 Z M 410 112 L 439 128 L 425 159 L 394 142 Z" fill="${accent}" stroke="white" stroke-width="12"/>
			<path d="M 80 223 L 107 209 M 426 217 L 453 232 M 129 83 L 138 52 M 382 77 L 373 47" stroke="#54c8b4" stroke-width="12" stroke-linecap="round"/>`;
	}
	if (pose.id === "love") {
		return `<path d="M 98 197 C 60 161 27 209 98 258 C 169 209 136 161 98 197 Z M 414 177 C 382 147 352 189 414 231 C 476 189 446 147 414 177 Z" fill="${accent}" stroke="white" stroke-width="15"/>`;
	}
	if (pose.id === "sleepy") {
		return `<text x="365" y="160" fill="${accent}" stroke="white" stroke-width="9" paint-order="stroke" font-family="Arial Rounded MT Bold, sans-serif" font-size="64" font-weight="700">Z</text>
			<text x="414" y="105" fill="${accent}" stroke="white" stroke-width="7" paint-order="stroke" font-family="Arial Rounded MT Bold, sans-serif" font-size="45" font-weight="700">z</text>`;
	}
	if (pose.id === "angry") {
		return `<path d="M 103 192 C 67 170 48 198 65 222 C 36 227 43 266 79 267 C 81 296 123 302 137 270" fill="white" stroke="${outline}" stroke-width="9"/>
			<path d="M 409 191 C 445 169 464 197 447 221 C 476 226 469 265 433 266 C 431 295 389 301 375 269" fill="white" stroke="${outline}" stroke-width="9"/>`;
	}
	if (pose.id === "good-luck") {
		return `<path d="M 87 176 L 104 214 L 145 218 L 114 245 L 123 286 L 87 265 L 51 286 L 60 245 L 29 218 L 70 214 Z M 425 119 L 437 147 L 468 150 L 445 171 L 451 201 L 425 186 L 398 201 L 405 171 L 381 150 L 413 147 Z" fill="${accent}" stroke="white" stroke-width="10"/>`;
	}
	if (pose.id === "dance" || pose.id === "music") {
		return `<path d="M 77 183 Q 48 137 90 113 Q 133 91 144 140 Q 149 178 116 193 Q 91 203 77 183 Z" fill="${accent}" stroke="white" stroke-width="12"/>
			<path d="M 399 105 V 192 Q 373 173 351 192 Q 337 205 347 222 Q 360 241 383 230 Q 408 219 408 188 V 137 L 459 124 V 178 Q 435 162 416 179" fill="none" stroke="${outline}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`;
	}
	if (pose.id === "rainy") {
		return `<path d="M 112 190 Q 256 37 400 190 Z" fill="#65c7f7" stroke="white" stroke-width="20"/>
			<path d="M 112 190 Q 256 37 400 190 Z" fill="#65c7f7" stroke="${outline}" stroke-width="10"/>
			<path d="M 256 91 V 390 Q 256 425 226 425" fill="none" stroke="${outline}" stroke-width="12" stroke-linecap="round"/>`;
	}
	if (pose.id === "sunny") {
		return `<circle cx="408" cy="119" r="49" fill="#ffd166" stroke="white" stroke-width="14"/>
			<path d="M 408 42 V 17 M 408 221 V 196 M 331 119 H 306 M 510 119 H 485 M 352 64 L 333 45 M 464 64 L 483 45 M 352 174 L 333 193 M 464 174 L 483 193" stroke="#ffd166" stroke-width="12" stroke-linecap="round"/>`;
	}
	if (pose.id === "idea") {
		return `<path d="M 393 72 C 340 72 317 135 351 170 C 366 186 369 198 369 218 H 417 C 417 198 420 186 435 170 C 469 135 446 72 393 72 Z" fill="#ffd166" stroke="white" stroke-width="18"/>
			<path d="M 393 72 C 340 72 317 135 351 170 C 366 186 369 198 369 218 H 417 C 417 198 420 186 435 170 C 469 135 446 72 393 72 Z M 371 239 H 415 M 377 260 H 409" fill="none" stroke="${outline}" stroke-width="10" stroke-linecap="round"/>
			<path d="M 393 39 V 13 M 325 62 L 307 43 M 461 62 L 479 43 M 300 129 H 273 M 486 129 H 513" stroke="${accent}" stroke-width="11" stroke-linecap="round"/>`;
	}
	if (pose.id === "on-my-way") {
		return `<path d="M 48 192 H 137 M 23 238 H 117 M 55 284 H 139" stroke="${accent}" stroke-width="13" stroke-linecap="round"/>
			<path d="M 383 125 L 468 210 L 383 295 V 247 H 319 V 173 H 383 Z" fill="${accent}" stroke="white" stroke-width="15" stroke-linejoin="round"/>`;
	}
	return "";
}

function snackProp({ pack }: { pack: CharacterStickerPack }): string {
	const { accent, outline } = pack.palette;
	if (pack.species === "rabbit") {
		return `<path d="M 244 359 L 286 273 Q 313 289 304 317 L 273 383 Z" fill="#f58b37" stroke="${outline}" stroke-width="9"/>
			<path d="M 284 284 Q 275 247 298 227 Q 302 258 318 275 Q 305 279 284 284 Z" fill="#55b86b" stroke="${outline}" stroke-width="8"/>`;
	}
	if (pack.species === "mouse") {
		return `<path d="M 218 304 H 302 L 292 396 Q 256 419 220 396 Z" fill="#f3d8b6" stroke="${outline}" stroke-width="10"/>
			<path d="M 229 319 H 291" stroke="${accent}" stroke-width="15"/>
			<circle cx="239" cy="376" r="9" fill="#5b3a2d"/><circle cx="266" cy="386" r="9" fill="#5b3a2d"/><circle cx="282" cy="363" r="9" fill="#5b3a2d"/>
			<path d="M 270 302 L 301 235" stroke="#80c9b5" stroke-width="10" stroke-linecap="round"/>`;
	}
	return `<rect x="211" y="301" width="90" height="91" rx="25" fill="#fff1b8" stroke="${outline}" stroke-width="10"/>
		<path d="M 225 320 Q 256 295 287 320" fill="none" stroke="${accent}" stroke-width="10"/>
		<path d="M 239 350 Q 256 369 273 350" fill="none" stroke="${outline}" stroke-width="8" stroke-linecap="round"/>`;
}

function frontProps({
	pack,
	pose,
}: {
	pack: CharacterStickerPack;
	pose: CharacterStickerPose;
}): string {
	const { accent, body, outline } = pack.palette;
	if (pose.id === "snack") return snackProp({ pack });
	if (pose.id === "selfie") {
		return `<rect x="317" y="284" width="86" height="130" rx="20" fill="#364253" stroke="white" stroke-width="24" transform="rotate(9 360 349)"/>
			<rect x="317" y="284" width="86" height="130" rx="20" fill="#364253" stroke="${outline}" stroke-width="10" transform="rotate(9 360 349)"/>
			<circle cx="369" cy="309" r="13" fill="${accent}"/>
			<ellipse cx="318" cy="381" rx="39" ry="29" fill="${body}" stroke="${outline}" stroke-width="10" transform="rotate(-24 318 381)"/>`;
	}
	if (pose.id === "cry") {
		return `<ellipse cx="256" cy="431" rx="96" ry="18" fill="#7bcaf5" opacity="0.72"/>`;
	}
	if (pose.id === "cheer" || pose.id === "celebrate") {
		return `<path d="M 166 351 L 91 285 L 111 270 L 185 331 M 346 350 L 421 284 L 401 269 L 327 330" stroke="${outline}" stroke-width="10" stroke-linecap="round"/>
			<path d="M 73 226 L 151 245 L 114 295 Z M 439 225 L 361 244 L 398 294 Z" fill="${accent}" stroke="${outline}" stroke-width="9"/>`;
	}
	if (pose.id === "thumbs-up" || pose.id === "okay") {
		return `<path d="M 323 394 Q 341 359 351 319 Q 357 295 378 303 Q 397 310 386 343 L 421 343 Q 443 343 438 364 L 427 407 Q 422 430 398 430 H 335 Z" fill="${body}" stroke="white" stroke-width="24" stroke-linejoin="round"/>
			<path d="M 323 394 Q 341 359 351 319 Q 357 295 378 303 Q 397 310 386 343 L 421 343 Q 443 343 438 364 L 427 407 Q 422 430 398 430 H 335 Z" fill="${body}" stroke="${outline}" stroke-width="10" stroke-linejoin="round"/>`;
	}
	if (pose.id === "working" || pose.id === "busy") {
		return `<rect x="165" y="334" width="182" height="112" rx="15" fill="#dce9f5" stroke="white" stroke-width="22"/>
			<rect x="165" y="334" width="182" height="112" rx="15" fill="#dce9f5" stroke="${outline}" stroke-width="10"/>
			<circle cx="256" cy="385" r="19" fill="${accent}"/><path d="M 142 454 H 370" stroke="${outline}" stroke-width="12" stroke-linecap="round"/>`;
	}
	if (pose.id === "coffee") {
		return `<path d="M 196 337 H 313 L 302 425 Q 256 446 207 425 Z" fill="#fff7e8" stroke="white" stroke-width="22"/>
			<path d="M 196 337 H 313 L 302 425 Q 256 446 207 425 Z" fill="#fff7e8" stroke="${outline}" stroke-width="10"/>
			<path d="M 313 354 Q 365 347 361 385 Q 356 417 307 404" fill="none" stroke="${outline}" stroke-width="11"/>
			<path d="M 228 313 Q 213 285 232 266 M 267 313 Q 252 285 271 266" fill="none" stroke="${accent}" stroke-width="9" stroke-linecap="round"/>`;
	}
	if (pose.id === "gift" || pose.id === "birthday") {
		return `<rect x="181" y="341" width="151" height="105" rx="12" fill="${accent}" stroke="white" stroke-width="22"/>
			<rect x="181" y="341" width="151" height="105" rx="12" fill="${accent}" stroke="${outline}" stroke-width="9"/>
			<path d="M 256 341 V 446 M 175 371 H 338" stroke="#fff4ca" stroke-width="18"/>
			<path d="M 256 341 Q 207 310 206 278 Q 249 271 256 321 Q 263 271 306 278 Q 305 310 256 341 Z" fill="#fff4ca" stroke="${outline}" stroke-width="8"/>`;
	}
	if (pose.id === "wait") {
		return `<circle cx="361" cy="369" r="63" fill="white" stroke="${outline}" stroke-width="10"/>
			<path d="M 361 369 V 329 M 361 369 L 392 388" stroke="${accent}" stroke-width="11" stroke-linecap="round"/>`;
	}
	if (pose.id === "hungry") {
		return `<path d="M 181 378 Q 256 452 331 378 Z" fill="#fff1d2" stroke="${outline}" stroke-width="10"/>
			<path d="M 165 365 H 347" stroke="${accent}" stroke-width="14" stroke-linecap="round"/>`;
	}
	if (pose.id === "rest") {
		return `<rect x="151" y="361" width="212" height="91" rx="42" fill="#bde0fe" stroke="white" stroke-width="22" transform="rotate(-5 257 406)"/>
			<rect x="151" y="361" width="212" height="91" rx="42" fill="#bde0fe" stroke="${outline}" stroke-width="9" transform="rotate(-5 257 406)"/>`;
	}
	if (pose.id === "brave") {
		return `<path d="M 256 314 L 341 344 V 390 C 341 437 304 465 256 481 C 208 465 171 437 171 390 V 344 Z" fill="${accent}" stroke="white" stroke-width="24" stroke-linejoin="round"/>
			<path d="M 256 314 L 341 344 V 390 C 341 437 304 465 256 481 C 208 465 171 437 171 390 V 344 Z" fill="${accent}" stroke="${outline}" stroke-width="10" stroke-linejoin="round"/>
			<path d="M 256 347 V 446 M 206 389 H 306" stroke="white" stroke-width="12" stroke-linecap="round"/>`;
	}
	return "";
}

function messageBadge({
	pack,
	pose,
}: {
	pack: CharacterStickerPack;
	pose: CharacterStickerPose;
}): string {
	if (!pose.message) return "";
	const fontSize =
		pose.message.length >= 5 ? 30 : pose.message.length >= 4 ? 34 : 40;
	const width = Math.min(
		300,
		Math.max(150, pose.message.length * fontSize + 52)
	);
	const x = 256 - width / 2;
	return `<g transform="rotate(-4 256 82)">
		<rect x="${x}" y="28" width="${width}" height="78" rx="34" fill="white" stroke="${pack.palette.outline}" stroke-width="9"/>
		<text x="256" y="80" text-anchor="middle" fill="${pack.palette.accent}" font-family="PingFang SC, Noto Sans CJK SC, Arial, sans-serif" font-size="${fontSize}" font-weight="800">${escapeXml({ value: pose.message })}</text>
	</g>`;
}

function renderSticker({
	pack,
	pose,
}: {
	pack: CharacterStickerPack;
	pose: CharacterStickerPose;
}): string {
	const { body, inner, outline } = pack.palette;
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" role="img" aria-label="${pack.name} ${pose.name}">
	<defs>
		<filter id="shadow" x="-30%" y="-30%" width="160%" height="170%">
			<feDropShadow dx="0" dy="13" stdDeviation="10" flood-color="#312331" flood-opacity="0.22"/>
		</filter>
	</defs>
	<g filter="url(#shadow)">
		${backProps({ pack, pose })}
		${ears({ pack })}
		<ellipse cx="256" cy="367" rx="128" ry="105" fill="${body}" stroke="white" stroke-width="32"/>
		<path d="M 128 230 C 128 142 188 112 256 112 C 324 112 384 142 384 230 C 384 329 330 371 256 371 C 182 371 128 329 128 230 Z" fill="${body}" stroke="white" stroke-width="32" stroke-linejoin="round"/>
		<ellipse cx="256" cy="367" rx="128" ry="105" fill="${body}" stroke="${outline}" stroke-width="12"/>
		<path d="M 128 230 C 128 142 188 112 256 112 C 324 112 384 142 384 230 C 384 329 330 371 256 371 C 182 371 128 329 128 230 Z" fill="${body}" stroke="${outline}" stroke-width="12" stroke-linejoin="round"/>
		<ellipse cx="171" cy="373" rx="47" ry="36" fill="${body}" stroke="${outline}" stroke-width="10" transform="rotate(20 171 373)"/>
		<ellipse cx="341" cy="373" rx="47" ry="36" fill="${body}" stroke="${outline}" stroke-width="10" transform="rotate(-20 341 373)"/>
		<ellipse cx="214" cy="452" rx="52" ry="28" fill="${inner}" stroke="${outline}" stroke-width="10"/>
		<ellipse cx="298" cy="452" rx="52" ry="28" fill="${inner}" stroke="${outline}" stroke-width="10"/>
		${speciesDetails({ pack })}
		${expression({ pack, pose })}
		${frontProps({ pack, pose })}
		${messageBadge({ pack, pose })}
	</g>
</svg>
`;
}

const directories = CHARACTER_STICKER_PACKS.map((pack) =>
	mkdir(join(OUTPUT_ROOT, pack.id), { recursive: true })
);
await Promise.all(directories);

const files = CHARACTER_STICKER_PACKS.flatMap((pack) =>
	pack.poses.map((pose) => ({
		content: normalizeSvg({ value: renderSticker({ pack, pose }) }),
		path: join(OUTPUT_ROOT, pack.id, `${pose.id}.svg`),
	}))
);
await Promise.all(files.map((file) => Bun.write(file.path, file.content)));

console.log(
	`Generated ${files.length} QCut character stickers in ${OUTPUT_ROOT}`
);

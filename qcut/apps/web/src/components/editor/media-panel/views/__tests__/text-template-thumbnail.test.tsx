import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	buildTextTemplate,
	getTextTemplateDefinitionsByCategory,
} from "@/lib/text/text-template-registry";
import { TextTemplateThumbnail } from "../text-template-thumbnail";

describe("TextTemplateThumbnail", () => {
	it("uses generated image assets before falling back to canvas rendering", () => {
		const definition = getTextTemplateDefinitionsByCategory({
			category: "red",
		})[0];
		const template = buildTextTemplate({ definition });
		const { container } = render(
			<TextTemplateThumbnail
				definition={definition}
				template={template}
				thumbnailUrl="/text-assets/text-fancy-red/fire@1/thumbnail.webp"
			/>
		);

		const image = screen.getByRole("img", {
			name: `${template.name} 缩略图`,
		});
		expect(image.getAttribute("src")).toBe(
			"/text-assets/text-fancy-red/fire@1/thumbnail.webp"
		);
		expect(
			container.querySelector('[data-thumbnail-renderer="image"]')
		).not.toBeNull();

		fireEvent.error(image);

		expect(
			container.querySelector('[data-thumbnail-renderer="canvas"]')
		).not.toBeNull();
	});
});

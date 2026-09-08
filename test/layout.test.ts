import { describe, expect, it } from "vitest";

import { Layout } from "../src/board/layout";

describe("Layout", () => {
	it("numbers keys in reading order whatever order they appeared in", () => {
		const layout = new Layout();
		const coords = [
			["e", 1, 1],
			["a", 0, 0],
			["f", 2, 1],
			["c", 2, 0],
			["b", 1, 0],
			["d", 0, 1],
		] as const;
		for (const [id, column, row] of coords) {
			layout.set("mini", id, { column, row });
		}
		expect(layout.ordered("mini")).toEqual(["a", "b", "c", "d", "e", "f"]);
		expect(layout.indexOf("d")).toBe(3);
		expect(layout.count("mini")).toBe(6);
		expect(layout.indexOf("nope")).toBeUndefined();
	});

	it("re-packs when a key disappears", () => {
		const layout = new Layout();
		layout.set("mini", "a", { column: 0, row: 0 });
		layout.set("mini", "b", { column: 1, row: 0 });
		layout.set("mini", "c", { column: 2, row: 0 });
		layout.remove("b");
		expect(layout.indexOf("c")).toBe(1);
		expect(layout.count("mini")).toBe(2);
	});

	it("keeps devices apart", () => {
		const layout = new Layout();
		for (let row = 0; row < 4; row++) {
			for (let column = 0; column < 8; column++) {
				layout.set("xl", `xl-${row}-${column}`, { column, row });
			}
		}
		layout.set("mini", "m", { column: 0, row: 0 });
		expect(layout.count("xl")).toBe(32);
		expect(layout.indexOf("xl-3-7")).toBe(31);
		expect(layout.indexOf("m")).toBe(0);
		expect(layout.devices().sort()).toEqual(["mini", "xl"]);
	});
});

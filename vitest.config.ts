import { defineConfig } from "vitest/config";

// The actions are classes under @action decorators (the Elgato scaffold).
// vitest 4 transforms with oxc, which leaves decorators alone unless told
// to lower them; rollup builds the plugin through its own TypeScript step.
export default defineConfig({
	oxc: { decorator: { legacy: true } },
});

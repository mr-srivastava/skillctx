import tailwind from "bun-plugin-tailwind";

// The CLI build can't take plugins, and bunfig's [serve.static] only covers
// the runtime bundler. The compiled binary bundles the UI at build time, so
// Tailwind has to be passed here.
const result = await Bun.build({
	entrypoints: ["src/cli/index.ts"],
	compile: { outfile: "dist/skillctx" },
	plugins: [tailwind],
});

if (!result.success) {
	for (const log of result.logs) console.error(log);
	process.exit(1);
}

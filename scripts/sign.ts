// Bun appends the bundled app to the binary after the linker signs it, which
// invalidates the ad-hoc signature on macOS and the kernel kills it on launch.
// Re-sign ad-hoc after compiling. No-op on other platforms.
if (process.platform === "darwin") {
	const proc = Bun.spawnSync([
		"codesign",
		"--force",
		"--sign",
		"-",
		"dist/skillctx",
	]);
	if (proc.exitCode !== 0) {
		console.error(proc.stderr.toString());
		process.exit(proc.exitCode ?? 1);
	}
}

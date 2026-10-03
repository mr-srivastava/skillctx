/** "1 file", "3 files"; pass the plural when it isn't the word plus "s". */
export function plural(n: number, one: string, many = `${one}s`): string {
	return `${n} ${n === 1 ? one : many}`;
}

/** "512 B" below a kilobyte, "14.2 KB" above. */
export function formatBytes(bytes: number): string {
	return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

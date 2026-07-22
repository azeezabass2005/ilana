/** Svelte action: call the handler when a pointer goes down outside the node. */
export function clickOutside(node: HTMLElement, handler: () => void) {
	let cb = handler;
	const onDoc = (e: PointerEvent) => {
		if (!node.contains(e.target as Node)) cb();
	};
	document.addEventListener('pointerdown', onDoc, true);
	return {
		update(next: () => void) {
			cb = next;
		},
		destroy() {
			document.removeEventListener('pointerdown', onDoc, true);
		}
	};
}

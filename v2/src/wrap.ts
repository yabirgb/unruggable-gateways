export type Unwrappable<T> = T | Wrapped<T>;

export function unwrap<T>(x: Unwrappable<T>) {
	return x instanceof Wrapped ? x.get() : x;
}

export class Wrapped<T> {
	private value: Promise<T> | undefined;
	constructor(private init: () => Promise<T>) {}
	get() {
		if (!this.value) {
			this.value = this.init();
		}
		return this.value;
	}
}


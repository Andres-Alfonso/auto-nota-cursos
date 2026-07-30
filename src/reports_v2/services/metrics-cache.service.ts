import { Injectable } from '@nestjs/common';

@Injectable()
export class MetricsCache {
    private readonly ttlMs = 5 * 60 * 1000;
    private readonly maxEntries = 500;
    private readonly store = new Map<string, { expiresAt: number; data: unknown }>();

    get<T>(key: string): T | null {
        const hit = this.store.get(key);
        if (!hit) return null;

        if (hit.expiresAt < Date.now()) {
            this.store.delete(key);
            return null;
        }
        return hit.data as T;
    }

    set(key: string, data: unknown): void {
        if (this.store.size >= this.maxEntries) {
            const oldest = this.store.keys().next().value;
            if (oldest !== undefined) {
                this.store.delete(oldest);
            }
        }
        this.store.set(key, { expiresAt: Date.now() + this.ttlMs, data });
    }
}
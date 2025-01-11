import { Injectable } from '@angular/core';

/**
 * Service for formatting time and timestamps consistently across the application.
 */
@Injectable({
    providedIn: 'root'
})
export class TimeFormatService {
    /**
     * Gets the time elapsed since a timestamp.
     *
     * @param timestamp - ISO timestamp string or Date object
     * @returns Formatted elapsed time string
     */
    getElapsedTime(timestamp: string | Date): string {
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        const now = new Date();
        const elapsed = now.getTime() - date.getTime();

        const seconds = Math.floor(elapsed / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days}d ${hours % 24}h`;
        } else if (hours > 0) {
            return `${hours}h ${minutes % 60}m`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    /**
     * Gets the time elapsed since a timestamp in compact format.
     *
     * @param timestamp - ISO timestamp string or Date object
     * @returns Formatted elapsed time string
     */
    getCompactElapsedTime(timestamp: string | Date): string {
        const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
        const now = new Date();
        const elapsed = now.getTime() - date.getTime();
        return `${Math.floor(elapsed / 1000)}s`;
    }
}

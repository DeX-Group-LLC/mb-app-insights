import { Component, OnInit, ViewChild, OnDestroy, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatTableModule, MatTableDataSource } from '@angular/material/table';
import { MatSortModule, MatSort, Sort } from '@angular/material/sort';
import { MatPaginatorModule, MatPaginator } from '@angular/material/paginator';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BehaviorSubject, Observable, Subject, Subscription } from 'rxjs';
import { LogService, LogEntry } from '../../services/log.service';
import { animate, state, style, transition, trigger } from '@angular/animations';

/**
 * Component for displaying and managing log entries.
 * Provides filtering, sorting, and expansion functionality for log entries.
 */
@Component({
    selector: 'app-logs',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatCardModule,
        MatTableModule,
        MatSortModule,
        MatPaginatorModule,
        MatIconModule,
        MatButtonModule,
        MatMenuModule,
        MatFormFieldModule,
        MatInputModule,
        MatTooltipModule
    ],
    templateUrl: './logs.component.html',
    styleUrls: ['./logs.component.scss'],
    animations: [
        trigger('detailExpand', [
            state('collapsed', style({ height: '0px', minHeight: '0' })),
            state('expanded', style({ height: '*' })),
            transition('expanded <=> collapsed', animate('150ms ease')),
        ]),
    ],
})
export class LogsComponent implements OnInit, AfterViewInit, OnDestroy {
    /** Columns to display in the table */
    displayedColumns = ['timestamp', 'level', 'module', 'message', 'meta'];
    /** Data source for the table */
    dataSource = new MatTableDataSource<LogEntry>([]);
    /** Set of currently expanded rows */
    expandedRows = new Set<LogEntry>();
    /** Whether multiple rows can be expanded simultaneously */
    isMultiExpandEnabled = false;
    /** Whether log updates are paused */
    isPaused = false;

    /** Reference to the table's sort directive */
    @ViewChild(MatSort) sort!: MatSort;
    /** Reference to the table's paginator */
    @ViewChild(MatPaginator) paginator!: MatPaginator;

    /** Filter for timestamp column */
    timestampFilter = '';
    /** Filter for level column */
    levelFilter = '';
    /** Filter for module column */
    moduleFilter = '';
    /** Filter for message column */
    messageFilter = '';
    /** Filter for meta column */
    metaFilter = '';

    /** Subject for handling component destruction */
    private destroy$ = new Subject<void>();
    /** Subscription to log updates */
    private logsSubscription?: Subscription;
    /** Latest logs received from the service */
    private latestLogs: LogEntry[] = [];

    /**
     * Creates an instance of LogsComponent.
     *
     * @param logService - Service for managing logs
     */
    constructor(private logService: LogService) {}

    /**
     * Initializes the component.
     * Clears data source and expanded state.
     */
    ngOnInit() {
        // Clear data source and expanded state on init
        this.dataSource.data = [];
        this.expandedRows.clear();
    }

    /**
     * Sets up the component after view initialization.
     * Configures sorting and pagination, and sets up log subscription.
     */
    ngAfterViewInit() {
        this.dataSource.sort = this.sort;
        this.dataSource.paginator = this.paginator;

        setTimeout(() => {
            // Setup initial logs subscription
            this.setupLogsSubscription();

            // Set default sort to timestamp descending
            this.sort.sort({
                id: 'timestamp',
                start: 'desc',
                disableClear: false
            });
        });
    }

    /**
     * Cleans up resources when the component is destroyed.
     */
    ngOnDestroy() {
        this.destroy$.next();
        this.destroy$.complete();
        this.logsSubscription?.unsubscribe();
    }

    /**
     * Sets up subscription to log updates.
     * Updates the data source when new logs are received.
     */
    private setupLogsSubscription() {
        // Unsubscribe from any existing subscription
        if (this.logsSubscription) {
            this.logsSubscription.unsubscribe();
        }

        this.logsSubscription = this.logService.logs$.subscribe(logs => {
            this.latestLogs = logs;
            if (!this.isPaused) {
                this.dataSource.data = this.applyFilters(logs);
            }
        });
    }

    /**
     * Refreshes the logs display with current filters.
     */
    refreshLogs() {
        this.dataSource.data = this.applyFilters(this.latestLogs);
    }

    /**
     * Toggles the pause state of log updates.
     */
    togglePause() {
        this.isPaused = !this.isPaused;
        if (!this.isPaused) {
            this.refreshLogs();
        }
    }

    /**
     * Toggles multi-expand functionality.
     * When disabled, collapses all expanded rows.
     */
    toggleMultiExpand(): void {
        this.isMultiExpandEnabled = !this.isMultiExpandEnabled;
        if (!this.isMultiExpandEnabled) {
            // If disabling multi-expand, collapse all rows
            this.expandedRows.clear();
        }
    }

    /**
     * Toggles the expansion state of a log entry's metadata.
     *
     * @param log - Log entry to toggle
     */
    toggleMetaExpansion(log: LogEntry) {
        if (this.isMultiExpandEnabled) {
            if (this.expandedRows.has(log)) {
                this.expandedRows.delete(log);
            } else {
                this.expandedRows.add(log);
            }
        } else {
            if (this.expandedRows.has(log)) {
                this.expandedRows.clear();
            } else {
                this.expandedRows.clear();
                this.expandedRows.add(log);
            }
        }
    }

    /**
     * Checks if a row is expanded.
     *
     * @param row - Row to check
     * @returns Whether the row is expanded
     */
    isExpanded(row: LogEntry): boolean {
        return this.expandedRows.has(row);
    }

    /**
     * Gets a preview of metadata fields.
     *
     * @param meta - Metadata object
     * @returns String describing number of metadata fields
     */
    getMetaPreview(meta: any): string {
        if (!meta) return '';
        const fields = Object.keys(meta);
        return fields.length === 1
            ? `1 field`
            : `${fields.length} fields`;
    }

    /**
     * Clears all active filters.
     */
    clearFilters() {
        this.timestampFilter = '';
        this.levelFilter = '';
        this.moduleFilter = '';
        this.messageFilter = '';
        this.metaFilter = '';
        this.applyFilter();
    }

    /**
     * Clears the timestamp filter.
     */
    clearTimestampFilter() {
        this.timestampFilter = '';
        this.applyFilter();
    }

    /**
     * Clears the level filter.
     */
    clearLevelFilter() {
        this.levelFilter = '';
        this.applyFilter();
    }

    /**
     * Clears the module filter.
     */
    clearModuleFilter() {
        this.moduleFilter = '';
        this.applyFilter();
    }

    /**
     * Clears the message filter.
     */
    clearMessageFilter() {
        this.messageFilter = '';
        this.applyFilter();
    }

    /**
     * Clears the meta filter.
     */
    clearMetaFilter() {
        this.metaFilter = '';
        this.applyFilter();
    }

    /**
     * Checks if any filters are currently active.
     *
     * @returns Whether any filters are active
     */
    hasActiveFilters(): boolean {
        return !!(this.timestampFilter || this.levelFilter || this.moduleFilter || this.messageFilter || this.metaFilter);
    }

    /**
     * Applies current filters to the data source.
     */
    applyFilter() {
        this.dataSource.data = this.applyFilters(this.latestLogs);
    }

    /**
     * Applies filters to a set of log entries.
     *
     * @param logs - Log entries to filter
     * @returns Filtered log entries
     */
    private applyFilters(logs: LogEntry[]): LogEntry[] {
        return logs.filter(log => {
            const matchesTimestamp = !this.timestampFilter ||
                log.timestamp.toString().toLowerCase().includes(this.timestampFilter.toLowerCase());
            const matchesLevel = !this.levelFilter ||
                log.level.toLowerCase().includes(this.levelFilter.toLowerCase());
            const matchesModule = !this.moduleFilter ||
                (log.module || '').toLowerCase().includes(this.moduleFilter.toLowerCase());
            const matchesMessage = !this.messageFilter ||
                log.message.toLowerCase().includes(this.messageFilter.toLowerCase());
            const matchesMeta = !this.metaFilter ||
                (log.meta && JSON.stringify(log.meta).toLowerCase().includes(this.metaFilter.toLowerCase()));

            return matchesTimestamp && matchesLevel && matchesModule && matchesMessage && matchesMeta;
        });
    }

    hasMetaData = (_index: number, row: LogEntry): boolean => {
        return !!row.meta;
    };
}

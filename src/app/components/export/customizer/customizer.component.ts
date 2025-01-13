import { Component, Inject, OnInit, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { ExportData, FieldSelection } from '../models/export.model';
import { exportToCsv, exportToJson, toCsv, toJson } from '../utils/export.utils';

interface CustomizerData {
    format: 'csv' | 'json';
    exportData: ExportData;
    options?: Partial<ExportOptions>;
}

interface ExportOptions {
    // Common options
    dateFormat: 'iso' | 'local' | 'unix';
    maxArrayItems: number | null;
    maxObjectKeys: number | null;

    // CSV specific options
    fieldDelimiter?: ',' | ';' | '\t' | ' ' | '|';
    arrayFormat?: 'json' | 'comma-list';
    objectFormat?: 'json' | 'flatten';
}

@Component({
    selector: 'app-export-customizer',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        MatDialogModule,
        MatButtonModule,
        MatCheckboxModule,
        MatExpansionModule,
        MatFormFieldModule,
        MatSelectModule
    ],
    templateUrl: './customizer.component.html',
    styleUrls: ['./customizer.component.scss']
})
export class ExportCustomizerComponent implements OnInit, AfterViewInit {
    selectedFields: FieldSelection[] = [];
    options: ExportOptions = {
        // Common defaults
        dateFormat: 'iso',
        maxArrayItems: null,  // all
        maxObjectKeys: null,  // all

        // CSV defaults
        fieldDelimiter: ',',
        arrayFormat: 'json',
        objectFormat: 'json'
    };
    preview: string = '';

    constructor(
        public dialogRef: MatDialogRef<ExportCustomizerComponent>,
        @Inject(MAT_DIALOG_DATA) public data: CustomizerData
    ) {
        this.options = {
            // Common defaults
            dateFormat: 'iso',
            maxArrayItems: null,
            maxObjectKeys: null,

            // CSV defaults (only set if format is CSV)
            ...(data.format === 'csv' ? {
                fieldDelimiter: ',',
                arrayFormat: 'json',
                objectFormat: 'json'
            } : {})
        };
    }

    ngOnInit(): void {
        this.initializeFieldSelection();
        this.updatePreview();
    }

    ngAfterViewInit(): void {
        // Set up ResizeObserver to update options section height
        const fieldsSection = document.querySelector('.fields-section');
        if (fieldsSection) {
            const resizeObserver = new ResizeObserver(entries => {
                for (const entry of entries) {
                    document.documentElement.style.setProperty('--fields-height', `${entry.contentRect.height}px`);
                }
            });
            resizeObserver.observe(fieldsSection);
        }
    }

    /**
     * Analyzes the data structure and creates a hierarchical field selection
     */
    private initializeFieldSelection(): void {
        if (Array.isArray(this.data.exportData.data)) {
            // Sample up to 10 items, evenly distributed through the array
            const data = this.data.exportData.data;
            const sampleSize = Math.min(10000, data.length);
            const step = Math.max(1, Math.floor(data.length / sampleSize));
            const samples = Array.from({ length: sampleSize }, (_, i) => data[i * step]);

            // Merge the structures of all samples
            this.selectedFields = samples.reduce((mergedFields, sample) => {
                const sampleFields = this.analyzeStructure(sample);
                return this.mergeFieldStructures(mergedFields, sampleFields);
            }, [] as FieldSelection[]);
        } else {
            this.selectedFields = this.analyzeStructure(this.data.exportData.data);
        }
    }

    /**
     * Merges two field structures, combining their children and preserving all unique fields
     */
    private mergeFieldStructures(fields1: FieldSelection[], fields2: FieldSelection[]): FieldSelection[] {
        const merged = new Map<string, FieldSelection>();

        // Helper to add fields to the map
        const addFields = (fields: FieldSelection[]) => {
            fields.forEach(field => {
                const key = field.path.join('.');
                if (!merged.has(key)) {
                    merged.set(key, { ...field, children: [] });
                }
                const existing = merged.get(key)!;

                // Merge children if both have them
                if (field.children?.length || existing.children?.length) {
                    existing.children = this.mergeFieldStructures(
                        existing.children || [],
                        field.children || []
                    );
                    // Update parent references
                    existing.children.forEach(child => child.parent = existing);
                }

                // Update type if the existing field is null and the new one isn't
                if (existing.type === 'null' && field.type !== 'null') {
                    existing.type = field.type;
                }
            });
        };

        addFields(fields1);
        addFields(fields2);

        // Convert map back to array, preserving order from fields1
        const result: FieldSelection[] = [];
        const seen = new Set<string>();

        // First add all fields from fields1 in their original order
        fields1.forEach(field => {
            const key = field.path.join('.');
            if (merged.has(key) && !seen.has(key)) {
                result.push(merged.get(key)!);
                seen.add(key);
            }
        });

        // Then add any new fields from fields2
        fields2.forEach(field => {
            const key = field.path.join('.');
            if (merged.has(key) && !seen.has(key)) {
                result.push(merged.get(key)!);
                seen.add(key);
            }
        });

        return result;
    }

    /**
     * Recursively analyzes an object's structure to create field selections
     */
    private analyzeStructure(obj: any, parentPath: string[] = [], level: number = 0): FieldSelection[] {
        if (!obj || typeof obj !== 'object') return [];

        return Object.entries(obj).map(([key, value]): FieldSelection => {
            const path = [...parentPath, key];
            const type = this.getValueType(value);
            const field: FieldSelection = {
                name: key,
                path,
                included: true,
                type,
                level,
                children: []
            };

            if (type === 'object' && value) {
                field.children = this.analyzeStructure(value, path, level + 1);
                field.children.forEach(child => child.parent = field);
            } else if (type === 'array' && Array.isArray(value) && value.length > 0) {
                // For arrays, analyze multiple items if they're objects
                if (value.some(item => item && typeof item === 'object')) {
                    // Sample up to 3 items from the array
                    const sampleSize = Math.min(3, value.length);
                    const step = Math.max(1, Math.floor(value.length / sampleSize));
                    const samples = Array.from({ length: sampleSize }, (_, i) => value[i * step])
                        .filter(item => item && typeof item === 'object');

                    field.children = samples.reduce((mergedFields, sample) => {
                        const sampleFields = this.analyzeStructure(sample, path, level + 1);
                        return this.mergeFieldStructures(mergedFields, sampleFields);
                    }, [] as FieldSelection[]);

                    field.children?.forEach(child => child.parent = field);
                }
            }

            return field;
        });
    }

    /**
     * Determines the type of a value
     */
    private getValueType(value: any): 'string' | 'number' | 'boolean' | 'date' | 'object' | 'array' | 'null' {
        if (value === undefined || value === null) return 'null';
        if (Array.isArray(value)) return 'array';
        if (value instanceof Date) return 'date';
        if (typeof value === 'object') return 'object';
        if (typeof value === 'string') return 'string';
        if (typeof value === 'number') return 'number';
        if (typeof value === 'boolean') return 'boolean';
        return 'string';
    }

    /**
     * Toggles selection of a field and its children
     */
    toggleField(field: FieldSelection, event?: any): void {
        // Prevent event from reaching parent checkboxes
        if (event) {
            event.stopPropagation?.();
        }

        if (field.children) {
            this.setChildrenSelection(field.children, field.included);
        }
        this.updateParentSelection(field);
        this.updatePreview();
    }

    /**
     * Recursively sets selection state of child fields
     */
    private setChildrenSelection(children: FieldSelection[], included: boolean): void {
        for (const child of children) {
            child.included = included;
            if (child.children) {
                this.setChildrenSelection(child.children, included);
            }
        }
    }

    /**
     * Updates parent selection based on children's state
     */
    private updateParentSelection(field: FieldSelection): void {
        if (!field.parent) return;

        const siblings = field.parent.children || [];
        const allSelected = siblings.every(f => f.included);
        const noneSelected = siblings.every(f => !f.included);

        field.parent.included = allSelected;
        if (!allSelected && !noneSelected) {
            field.parent.included = true; // Indeterminate state
        }

        this.updateParentSelection(field.parent);
    }

    /**
     * Gets all selected field paths
     */
    private getSelectedPaths(): string[][] {
        const paths: string[][] = [];

        const traverse = (fields: FieldSelection[], parentPath: string[] = []) => {
            for (const field of fields) {
                const currentPath = [...parentPath, field.name];

                if (field.included && (!field.children || field.children.length === 0)) {
                    paths.push(currentPath);
                }

                if (field.children) {
                    traverse(field.children, currentPath);
                }
            }
        };

        traverse(this.selectedFields);
        return paths;
    }

    /**
     * Gets a preview value for a field
     */
    getPreviewValue(field: FieldSelection): string {
        const sampleData = Array.isArray(this.data.exportData.data)
            ? this.data.exportData.data[0]
            : this.data.exportData.data;

        const value = field.path.reduce((obj, key) => obj?.[key], sampleData);

        if (value === undefined || value === null) return 'null';
        if (value instanceof Date) {
            switch (this.options.dateFormat) {
                default:
                case 'iso': return value.toISOString();
                case 'local': return value.toLocaleString();
                case 'unix': return Math.floor(value.getTime() / 1000).toString();
            }
        }
        if (typeof value === 'string') return `"${value.length > 20 ? value.slice(0, 20) + '...' : value}"`;
        if (typeof value === 'number') return value.toString();
        if (typeof value === 'boolean') return value.toString();
        if (Array.isArray(value)) {
            const maxItems = this.options.maxArrayItems ?? 2;
            const preview = value.slice(0, maxItems).map(item => {
                if (typeof item === 'object') return '{...}';
                return String(item);
            }).join(', ');
            return `[${preview}${value.length > maxItems ? ', ...' : ''}]`;
        }
        if (typeof value === 'object') {
            const keys = Object.keys(value);
            if (keys.length === 0) return '{}';
            const maxKeys = this.options.maxObjectKeys ?? 1;
            const previewKeys = keys.slice(0, maxKeys);
            return `{ ${previewKeys.map(k => `${k}: ...`).join(', ')}${keys.length > maxKeys ? ', ...' : ''} }`;
        }
        return String(value);
    }

    /**
     * Converts a camelCase or snake_case string to Title Case
     */
    private toTitleCase(str: string): string {
        // First handle snake_case
        const spacedStr = str.replace(/_/g, ' ');

        // Then handle camelCase
        const withSpaces = spacedStr.replace(/([A-Z])/g, ' $1');

        // Convert to title case
        return withSpaces
            .split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
            .join(' ')
            .trim();
    }

    /**
     * Gets the filtered export data based on field selection
     */
    private getExportData(): ExportData {
        const includedPaths = this.getSelectedPaths();

        // Filter the data to only include selected fields
        const filteredData = Array.isArray(this.data.exportData.data)
            ? this.data.exportData.data.map((item: any) => this.filterObjectByPaths(item, includedPaths))
            : this.filterObjectByPaths(this.data.exportData.data, includedPaths);

        // Generate headers from the field paths
        /*const headers = includedPaths.reduce((acc, path) => {
            const key = path.join('.');  // Use dot notation as the key
            acc[key] = path;  // Store the full path array
            return acc;
        }, {} as Record<string, string[]>);*/

        return {
            data: filteredData,
            filename: this.data.exportData.filename,
            fields: this.selectedFields
        };
    }

    /**
     * Gets the export data with all values formatted according to options
     */
    private getExportFormattedData(): ExportData {
        const exportData = this.getExportData();

        const formatRecursively = (value: any): any => {
            // First try to format the value directly
            value = this.formatValue(value);

            // Handle arrays
            if (Array.isArray(value)) {
                return value.map(item => formatRecursively(item));
            }

            // Handle objects
            if (typeof value === 'object' && value !== null) {
                return Object.fromEntries(
                    Object.entries(value).map(([key, val]) => [key, formatRecursively(val)])
                );
            }

            // Return primitives as-is
            return value;
        };

        return {
            ...exportData,
            data: Array.isArray(exportData.data)
                ? exportData.data.map(item => formatRecursively(item))
                : formatRecursively(exportData.data)
        };
    }

    /**
     * Filters an object to only include specified paths
     */
    private filterObjectByPaths(obj: any, paths: string[][]): any {
        if (!obj) return obj;

        const result: any = {};

        // Group paths by their first segment to handle arrays properly
        const pathsByRoot = paths.reduce((acc, path) => {
            const root = path[0];
            if (!acc[root]) acc[root] = [];
            acc[root].push(path.slice(1));
            return acc;
        }, {} as Record<string, string[][]>);

        Object.entries(pathsByRoot).forEach(([root, subPaths]) => {
            const value = obj[root];

            if (Array.isArray(value)) {
                // For arrays, we need to apply the subpaths to each item
                result[root] = value.map(item => {
                    if (subPaths.length === 0) return this.cloneWithDates(item);
                    return this.filterObjectByPaths(item, subPaths);
                });
            } else if (typeof value === 'object' && value !== null && !(value instanceof Date) && subPaths.length > 0) {
                // Only recurse for objects (not dates) that have subpaths
                result[root] = this.filterObjectByPaths(value, subPaths);
            } else {
                // For primitives, dates, or objects without subpaths, just clone the value
                result[root] = this.cloneWithDates(value);
            }
        });

        return result;
    }

    /**
     * Clones an object while preserving Date objects
     */
    private cloneWithDates(obj: any): any {
        if (obj === null || obj === undefined) return obj;
        if (obj instanceof Date) return new Date(obj);
        if (Array.isArray(obj)) return obj.map(item => this.cloneWithDates(item));
        if (typeof obj === 'object') {
            return Object.fromEntries(
                Object.entries(obj).map(([key, value]) => [key, this.cloneWithDates(value)])
            );
        }
        return obj;
    }

    /**
     * Updates the preview based on current selection and options
     */
    updatePreview(): void {
        const exportData = this.getExportFormattedData();
        const previewData = Array.isArray(exportData.data) ? exportData.data.slice(0, 3) : exportData.data;

        if (this.data.format === 'csv') {
            this.preview = toCsv({
                data: previewData,
                fields: this.selectedFields,
                filename: exportData.filename
            }, {
                fieldDelimiter: this.options.fieldDelimiter,
                arrayFormat: this.options.arrayFormat,
                objectFormat: this.options.objectFormat
            });
        } else {
            this.preview = toJson(previewData);
        }
    }

    /**
     * Saves the customized export configuration and closes the dialog
     */
    save(): void {
        const exportData = this.getExportFormattedData();

        // Pass the CSV options to the export function
        const csvOptions = {
            fieldDelimiter: this.options.fieldDelimiter,
            arrayFormat: this.options.arrayFormat,
            objectFormat: this.options.objectFormat
        };

        this.dialogRef.close({
            exportData,
            options: {
                ...this.options,
                csvOptions
            }
        });
    }

    /**
     * Checks if a field should be in an indeterminate state
     */
    isFieldIndeterminate(field: FieldSelection): boolean {
        if (!field.children?.length) return false;
        const selectedCount = field.children.filter(f => f.included).length;
        return selectedCount > 0 && selectedCount < field.children.length;
    }

    private formatValue(value: any, alt: any = value): any | undefined {
        if (value === null || value === undefined) return undefined;

        // Handle dates based on format
        if (value instanceof Date) {
            switch (this.options.dateFormat) {
                default:
                case 'iso': return value.toISOString();
                case 'local': return value.toLocaleString();
                case 'unix': return Math.floor(value.getTime() / 1000);
            }
        }

        // Handle arrays based on maxArrayItems
        if (Array.isArray(value)) {
            // Always return an array, even if empty
            const items = this.options.maxArrayItems !== null
                ? value.slice(0, this.options.maxArrayItems)
                : [...value];
            return items;
        }

        // Handle objects based on maxObjectKeys
        if (typeof value === 'object' && value !== null) {
            const keys = Object.keys(value);
            const limitedKeys = this.options.maxObjectKeys !== null
                ? keys.slice(0, this.options.maxObjectKeys)
                : keys;

            const obj = limitedKeys.reduce((acc, key) => {
                acc[key] = value[key];
                return acc;
            }, {} as any);

            return obj;
        }

        // Don't format primitives
        return alt;
    }

    // Add this method to handle option changes
    onOptionChange(): void {
        // Force a refresh of the field tree by creating a new array
        // This will trigger change detection and update the preview values
        this.selectedFields = [...this.selectedFields];

        // Force a refresh of the preview by creating a new string
        this.preview = this.preview + '';

        // Update the preview content
        this.updatePreview();
    }
}
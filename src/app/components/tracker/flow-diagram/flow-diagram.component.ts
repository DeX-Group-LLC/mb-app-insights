import { Component, Input, Output, EventEmitter, OnChanges, SimpleChanges, NO_ERRORS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatIconModule } from '@angular/material/icon';
import { ActionType, BrokerHeader, ClientHeader } from '../../../services/websocket.service';
import { MessageFlow } from '../tracker.component';

interface FlowNode {
    id: string;
    label: string;
    type: 'originator' | 'responder' | 'listener' | 'broker';
    x: number;
    y: number;
}

interface FlowMessage {
    from: string;
    to: string;
    label: string;
    type: 'request' | 'response' | 'publish';
    timestamp?: Date;
    status?: string;  // error code or 'SUCCESS'
    isBrokerInput?: boolean;  // True if message is going to broker
}

interface FlowData {
    nodes: FlowNode[];
    messages: FlowMessage[];
}

@Component({
    selector: 'app-flow-diagram',
    standalone: true,
    imports: [CommonModule, MatTooltipModule, MatIconModule],
    schemas: [NO_ERRORS_SCHEMA],
    templateUrl: './flow-diagram.component.html',
    styleUrls: ['./flow-diagram.component.scss']
})
export class FlowDiagramComponent implements OnChanges {
    @Input() messageFlow!: MessageFlow;
    @Output() messageSelect = new EventEmitter<string>();

    width = 800;
    height = 400;
    flowData: FlowData | null = null;

    ngOnChanges(changes: SimpleChanges): void {
        if (changes['messageFlow']) {
            this.buildFlowData();
        }
    }

    private buildFlowData(): void {
        if (!this.messageFlow) {
            this.flowData = null;
            return;
        }

        const nodes: FlowNode[] = [];
        const messages: FlowMessage[] = [];
        const serviceSpacing = 150;
        const messageSpacing = 30;
        const messageStartY = 60;
        const boxWidth = 100;
        const topPadding = 16;
        const horizontalPadding = 50;
        const sideServicesX = serviceSpacing * 4;

        // Track all Y positions for each service
        const serviceMessageYPositions = new Map<string, number[]>();

        // Add core services with top padding
        nodes.push({
            id: this.messageFlow.request.serviceId,
            label: this.messageFlow.request.serviceId,
            type: 'originator',
            x: horizontalPadding + boxWidth/2,
            y: topPadding
        });

        nodes.push({
            id: 'message-broker',
            label: 'Message Broker',
            type: 'broker',
            x: horizontalPadding + boxWidth/2 + serviceSpacing,
            y: topPadding
        });

        // Only add responder node if it exists and is needed
        const errorCode = this.messageFlow.response?.message?.payload?.['error']?.code;
        const isInternalError = errorCode === 'INTERNAL_ERROR';
        const isNoResponders = errorCode === 'NO_RESPONDERS';
        if (this.messageFlow.response?.target?.serviceId && !isNoResponders) {
            nodes.push({
                id: this.messageFlow.response.target.serviceId,
                label: this.messageFlow.response.target.serviceId,
                type: 'responder',
                x: horizontalPadding + boxWidth/2 + serviceSpacing * 2,
                y: topPadding
            });
        }

        // Calculate base width without auditors
        let baseWidth = horizontalPadding * 2 + boxWidth + serviceSpacing * (nodes.length - 1);

        // Add extra space for auditors if they exist
        if (this.messageFlow.auditors?.length) {
            baseWidth += serviceSpacing + horizontalPadding;
        }

        // Set final width
        this.width = baseWidth;

        let messageIndex = 0;

        // Add request messages
        messages.push({
            from: this.messageFlow.request.serviceId,
            to: 'message-broker',
            label: this.messageFlow.request.message.header.topic,
            type: 'request',
            timestamp: this.messageFlow.request.receivedAt,
            isBrokerInput: true
        });
        messageIndex++;

        // Only add message to responder if not NO_RESPONDERS and no internal error
        if (!isNoResponders && !isInternalError) {
            messages.push({
                from: 'message-broker',
                to: this.messageFlow.response!.target!.serviceId!,
                label: this.messageFlow.request.message.header.topic,
                type: 'request',
                isBrokerInput: false
            });
            messageIndex++;

            // Add messages to auditors after forwarding to responder
            this.messageFlow.auditors?.forEach(serviceId => {
                const msgY = messageStartY + messageIndex * messageSpacing;

                // Track Y position for this service
                if (!serviceMessageYPositions.has(serviceId)) {
                    serviceMessageYPositions.set(serviceId, []);
                }
                serviceMessageYPositions.get(serviceId)?.push(msgY);

                messages.push({
                    from: 'message-broker',
                    to: serviceId,
                    label: this.messageFlow.request.message.header.topic,
                    type: 'publish',
                    isBrokerInput: false
                });
                messageIndex++;
            });
        }

        // Add response messages if exists
        if (this.messageFlow.response?.message) {
            const status = this.messageFlow.response.message.payload?.['error']?.code ?? 'SUCCESS';
            const isFromBroker = this.messageFlow.response.fromBroker;

            if (!isFromBroker) {
                // Add response from target to broker
                messages.push({
                    from: this.messageFlow.response.target!.serviceId!,
                    to: 'message-broker',
                    label: this.messageFlow.request.message.header.topic,
                    type: 'response',
                    status,
                    isBrokerInput: true
                });
            }

            // Add response from broker to originator
            messages.push({
                from: 'message-broker',
                to: this.messageFlow.request.serviceId,
                label: this.messageFlow.request.message.header.topic,
                type: 'response',
                timestamp: this.messageFlow.request.respondedAt,
                status,
                isBrokerInput: false
            });
            messageIndex += isFromBroker ? 1 : 2;
        }

        // Add related messages
        this.messageFlow.relatedMessages?.forEach(msg => {
            const isPublish = msg.header.action === ActionType.PUBLISH;

            messages.push({
                from: this.messageFlow.response?.target?.serviceId || 'message-broker',
                to: 'message-broker',
                label: msg.header.topic,
                type: isPublish ? 'publish' : 'request',
                isBrokerInput: true
            });
            messageIndex++;

            // Add messages from broker to each target
            msg.targetServiceIds.forEach(targetId => {
                const msgY = messageStartY + messageIndex * messageSpacing;

                // Track Y position for this service
                if (!serviceMessageYPositions.has(targetId)) {
                    serviceMessageYPositions.set(targetId, []);
                }
                serviceMessageYPositions.get(targetId)?.push(msgY);

                messages.push({
                    from: 'message-broker',
                    to: targetId,
                    label: msg.header.topic,
                    type: isPublish ? 'publish' : 'request',
                    isBrokerInput: false
                });
                messageIndex++;
            });
        });

        // Add side services for each message position
        serviceMessageYPositions.forEach((yPositions, serviceId) => {
            yPositions.forEach(y => {
                nodes.push({
                    id: `${serviceId}-${y}`, // Make ID unique for each instance
                    label: serviceId,
                    type: 'listener',
                    x: sideServicesX,
                    y: y - 12 + topPadding
                });
            });
        });

        this.flowData = { nodes, messages };

        // Calculate dimensions including padding
        const maxY = Math.max(...nodes.map(n => n.y)) + messageSpacing;
        const diagramHeight = Math.max(messageSpacing, messageStartY + messages.length * messageSpacing + topPadding);
        this.height = Math.max(diagramHeight, maxY);
    }

    getNodeX(nodeId: string): number {
        // Strip the Y position suffix for side services when looking up nodes
        const baseNodeId = nodeId.split('-')[0];
        const node = this.flowData?.nodes.find(n => n.id.startsWith(baseNodeId));
        if (!node) return 0;

        // If this is a side service and we're getting the x for an arrow endpoint,
        // adjust by half the box width
        if (node.type === 'listener') {
            return node.x - 50; // Half of boxWidth
        }
        return node.x;
    }

    getArrowPath(fromX: number, toX: number, y: number): string {
        const direction = fromX < toX ? 1 : -1;
        const arrowSize = 6;
        const tipX = toX - (10 * direction);

        return `M ${tipX},${y - arrowSize}
                L ${toX},${y}
                L ${tipX},${y + arrowSize}
                Z`;
    }

    getMessageTooltip(msg: FlowMessage): string {
        const parts = [
            `Type: ${msg.type}`,
            `Topic: ${msg.label}`,
            `From: ${msg.from}`,
            `To: ${msg.to}`,
        ];

        if (msg.timestamp) {
            parts.push(`Time: ${msg.timestamp.toLocaleTimeString()}`);
        }

        if (msg.status) {
            parts.push(`Status: ${msg.status}`);
        }

        // Add header info if available
        const header = this.getMessageHeader(msg);
        if (header) {
            parts.push('', 'Header:');
            Object.entries(header).forEach(([key, value]) => {
                parts.push(`  ${key}: ${value}`);
            });
        }

        return parts.join('\n');
    }

    private getMessageHeader(msg: FlowMessage): BrokerHeader |ClientHeader | null {
        if (!this.messageFlow) return null;

        // For the main request/response flow
        if (msg.from === this.messageFlow.request.serviceId && msg.to === 'message-broker') {
            return this.messageFlow.request.message.header;
        }
        if (msg.from === 'message-broker' && msg.to === this.messageFlow.response?.target?.serviceId) {
            return this.messageFlow.request.message.header;
        }
        if (msg.from === this.messageFlow.response?.target?.serviceId && msg.to === 'message-broker' && this.messageFlow.response) {
            return this.messageFlow.request.message.header;
        }
        if (msg.from === 'message-broker' && msg.to === this.messageFlow.request.serviceId && this.messageFlow.response) {
            return this.messageFlow.request.message.header;
        }

        // For related messages
        const relatedMsg = this.messageFlow.relatedMessages?.find(rm => {
            return rm.header.topic === msg.label &&
                ((msg.isBrokerInput && msg.from === this.messageFlow.response?.target?.serviceId) ||
                 (!msg.isBrokerInput && rm.targetServiceIds.includes(msg.to)));
        });

        if (relatedMsg) {
            return relatedMsg.header;
        }

        return null;
    }

    isMessageClickable(msg: FlowMessage): boolean {
        const header = this.getMessageHeader(msg);
        return !!header?.requestid && header.requestid !== this.messageFlow.request.message.header.requestid;
    }

    onMessageClick(msg: FlowMessage): void {
        const header = this.getMessageHeader(msg);
        if (header?.requestid && header.requestid !== this.messageFlow.request.message.header.requestid) {
            this.messageSelect.emit(header.requestid);
        }
    }

    getStatusIcon(status: string): string {
        switch (status) {
            case 'SUCCESS': return 'check_circle';
            case 'NO_RESPONDERS':
            case 'SERVICE_UNAVAILABLE': return 'unpublished';
            case 'REQUEST_TIMEOUT': return 'timer_off';
            default: return 'cancel';
        }
    }

    getStatusColor(code: string): string {
        switch (code) {
            case 'SUCCESS': return 'success';
            case 'NO_RESPONDERS':
            case 'SERVICE_UNAVAILABLE': return 'dropped';
            case 'REQUEST_TIMEOUT': return 'timeout';
            default: return 'error';
        }
    }

    getStatusText(code: string): string {
        switch (code) {
            case 'SUCCESS': return 'Success';
            case 'NO_RESPONDERS':
            case 'SERVICE_UNAVAILABLE': return 'Dropped';
            case 'REQUEST_TIMEOUT': return 'Timeout';
            default: return 'Error';
        }
    }
}
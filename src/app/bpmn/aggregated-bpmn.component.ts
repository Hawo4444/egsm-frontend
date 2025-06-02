import {
    AfterContentInit,
    Component,
    ElementRef,
    Input,
    OnChanges,
    OnDestroy,
    ViewChild,
    SimpleChanges,
    Output,
} from '@angular/core';

import * as BpmnModeler from 'bpmn-js/dist/bpmn-modeler.production.min.js';
import { Subject } from 'rxjs';
import { BpmnBlockOverlayReport, Color } from '../primitives/primitives';

@Component({
    selector: 'app-aggregated-bpmn',
    templateUrl: './bpmn.component.html',
    styleUrls: ['./bpmn.component.scss'],
})
export class AggregatedBpmnComponent implements AfterContentInit, OnDestroy {
    bpmnJS: BpmnModeler = undefined
    elementNamesMap = new Map<string, string>();

    iconPositions: Map<string, { [deviationType: string]: number }> = new Map();
    gatewayBlocks: Map<string, any> = new Map();

    @ViewChild('ref', { static: true }) private el: ElementRef;

    @Input() public model_id: string;
    @Input() public model_xml: string;
    @Input() public aggregationSummary: any;
    @Output() DiagramEventEmitter: Subject<any> = new Subject();
    @Output() legendDataChanged: Subject<any[]> = new Subject();

    blockProperties = new Map() // Block name -> {BpmnBlockOverlayReport}
    visibleOverlays = new Map() // Block name -> overlay ID

    constructor() {
        this.bpmnJS = new BpmnModeler();
    }

    ngAfterContentInit(): void {
        this.bpmnJS.attachTo(this.el.nativeElement);
        if (this.model_xml) {
            this.updateModelXml(this.model_xml)
            this.populateElementNames()
        }

        this.setupAggregationEventHandlers();
        this.DiagramEventEmitter.next('INIT_DONE')
    }

    setupAggregationEventHandlers() {
        var eventBus = this.bpmnJS.get('eventBus');
        var bpmnJsRef = this.bpmnJS
        var context = this

        eventBus.on('element.hover', function (e) {
            var elementId = e.element.id

            // Check if this element has block properties (meaning it's a tracked BPMN element)
            if (context.blockProperties.has(elementId) ||
                e.element.type?.includes('Task') ||
                e.element.type?.includes('Event') ||
                e.element.type?.includes('Gateway')) {

                var stageData = context.getStageAggregationData(elementId);
                var overlay = bpmnJsRef.get('overlays');

                if (context.visibleOverlays.has('aggregation-overlay')) {
                    overlay.remove(context.visibleOverlays.get('aggregation-overlay'))
                    context.visibleOverlays.delete('aggregation-overlay')
                }

                context.visibleOverlays.set('aggregation-overlay', overlay.add(elementId, {
                    position: {
                        top: -25,
                        right: 0
                    },
                    html: context.createAggregationTooltip(elementId, stageData)
                }));
            }
        })

        // Remove tooltip on mouse leave
        eventBus.on('element.out', function (e) {
            if (context.visibleOverlays.has('aggregation-overlay')) {
                var overlay = bpmnJsRef.get('overlays');
                overlay.remove(context.visibleOverlays.get('aggregation-overlay'))
                context.visibleOverlays.delete('aggregation-overlay')
            }
        })
    }

    updateModelXml(value: string) {
        if (value) {
            this.blockProperties.clear()
            this.visibleOverlays.clear()
            this.gatewayBlocks.clear()
            this.iconPositions.clear()
            this.bpmnJS.importXML(value)
            this.bpmnJS.on('import.done', ({ error }) => {
                if (!error) {
                    this.bpmnJS.get('canvas').zoom('fit-viewport');
                }
            });
        }
    }

    populateElementNames(): void {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(this.model_xml, 'application/xml');
        const elements = xmlDoc.querySelectorAll('[id]');
        elements.forEach(element => {
            const id = element.getAttribute('id');
            const name = element.getAttribute('name') || '';
            if (id) {
                this.elementNamesMap.set(id, name);
            }
        });
    }

    /**
     * Apply aggregated overlay reports
     */
    applyAggregatedOverlayReport(overlayreport: BpmnBlockOverlayReport[]) {
        overlayreport.forEach(element => {
            if (this.blockProperties.has(element.block_id)) {
                const currentProps = this.blockProperties.get(element.block_id);
                const elementRegistry = this.bpmnJS.get('elementRegistry');
                const bpmnElement = elementRegistry.get(element.block_id);
                const isGateway = bpmnElement?.type.includes('Gateway');

                // Skip gateways since they use square overlays
                if (currentProps.color != element.color && !isGateway) {
                    this.setBlockColor(element.block_id, element.color)
                    currentProps.color = element.color
                }

                const currentFlags = new Set(Array.from(currentProps.flags));

                currentFlags.forEach(flag => {
                    if (!element.flags.some(f => f.deviation === flag)) {
                        this.removeOverlay(element.block_id + "_" + flag);
                        currentProps.flags.delete(flag);

                        if (this.iconPositions.has(element.block_id)) {
                            const positions = this.iconPositions.get(element.block_id)!;
                            if (positions[flag as string]) {
                                delete positions[flag as string];
                            }
                        }
                    }
                });

                element.flags.forEach(flag => {
                    this.addFlagToOverlay(element.block_id, flag);
                    if (!currentProps.flags.has(flag.deviation)) {
                        currentProps.flags.add(flag.deviation);
                    }
                });
            } else {
                this.blockProperties.set(element.block_id, {
                    color: element.color,
                    flags: new Set(element.flags.map(f => f.deviation))
                });

                const elementRegistry = this.bpmnJS.get('elementRegistry');
                const bpmnElement = elementRegistry.get(element.block_id);
                const isGateway = bpmnElement?.type.includes('Gateway');

                if (!isGateway) {
                    this.setBlockColor(element.block_id, element.color);
                }

                element.flags.forEach(flag => {
                    this.addFlagToOverlay(element.block_id, flag);
                });
            }
        });

        setTimeout(() => {
            const legendData = this.generateLegendData();
            this.legendDataChanged.next(legendData);
        }, 100);
    }

    setBlockColor(taskId: string, color: Color) {
        var modeling = this.bpmnJS.get('modeling');
        var elementRegistry = this.bpmnJS.get('elementRegistry');
        var element = elementRegistry.get(taskId)

        if (color == undefined) {
            modeling.setColor([element], { fill: '#ffffff' });
        } else {
            modeling.setColor([element], { fill: color.fill });
        }
    }

    addFlagToOverlay(elementId: string, flag: { deviation: string, details: any }) {
        const elementRegistry = this.bpmnJS.get('elementRegistry');
        const overlays = this.bpmnJS.get('overlays');
        const modeling = this.bpmnJS.get('modeling');
        const elementFactory = this.bpmnJS.get('elementFactory');
        const canvas = this.bpmnJS.get('canvas');

        const element = elementRegistry.get(elementId);
        if (!element) {
            return;
        }

        let html = '';
        switch (flag.deviation) {
            case 'INCOMPLETE':
                html = `<img width="25" height="25" src="assets/hazard.png" title="Incomplete Executions: ${flag.details?.count || '?'}">`;
                break;
            case 'MULTI_EXECUTION':
                const count = flag.details?.count ?? '?';
                html = `<img width="20" height="20" src="assets/repeat.png" title="Multi Executions: ${count}">`;
                break;
            case 'INCORRECT_EXECUTION':
                html = `<img width="25" height="25" src="assets/cross.png" title="Incorrect Executions: ${flag.details?.count || '?'}">`;
                break;
            case 'INCORRECT_BRANCH':
                html = `<img width="25" height="25" src="assets/cross.png" title="Incorrect Branch: ${flag.details?.count || '?'}">`;
                break;
            case 'SKIPPED':
                html = `<img width="25" height="25" src="assets/skip.webp" title="Skipped: ${flag.details?.count || '?'}">`;
                break;
            case 'OVERLAP':
                html = `<img src="assets/arrows.png" title="Overlaps: ${flag.details?.count || '?'}" style="transform: rotate(90deg); width:25px; height:25px;">`;
                break;
        }

        if (!html || html.trim() === '') {
            console.error(`Empty HTML generated for deviation: ${flag.deviation}`, flag);
            return;
        }

        const isGateway = element.type.includes('Gateway');
        if (isGateway) {
            const regionElements = this.findGatewayBlock(element);

            if (regionElements.length > 0) {
                const gatewayBlockKey = `${elementId}_gateway_block`;
                let addedShape = this.gatewayBlocks.get(elementId);

                if (!addedShape) {
                    const bbox = this.calculateBoundingBoxDirect(regionElements);
                    const shape = elementFactory.createShape({
                        type: 'bpmn:Group',
                        businessObject: {}
                    });

                    shape.x = bbox.x;
                    shape.y = bbox.y;
                    shape.width = bbox.width;
                    shape.height = bbox.height;

                    const rootElement = canvas.getRootElement();
                    addedShape = modeling.createShape(shape, { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }, rootElement);

                    const gfx = elementRegistry.getGraphics(addedShape);
                    const rect = gfx.querySelector('rect');

                    if (rect) {
                        rect.removeAttribute('style');
                        // Set background color based on severity/color for the square
                        const backgroundColor = this.getBackgroundColorFromFlag(flag);
                        rect.setAttribute('stroke', 'red');
                        rect.setAttribute('stroke-width', '2');
                        rect.setAttribute('stroke-dasharray', '4,2');
                        rect.setAttribute('fill', backgroundColor);
                        rect.setAttribute('fill-opacity', '0.3');
                    }

                    this.visibleOverlays.set(gatewayBlockKey, addedShape);
                    this.gatewayBlocks.set(elementId, addedShape);
                }

                this.updateGatewayIcon(elementId, flag, html, addedShape);
                return;
            }
        }

        this.updateRegularElementIcon(elementId, flag, html);
    }

    getBackgroundColorFromFlag(flag: any): string {
        const severityColors = {
            'CRITICAL': '#ffcccc',
            'HIGH': '#ffe6cc',
            'MEDIUM': '#ffffcc',
            'LOW': '#e6ffcc'
        };

        return severityColors[flag.details?.severity] || '#f0f0f0';
    }

    updateGatewayIcon(elementId: string, flag: { deviation: string, details: any }, html: string, addedShape: any) {
        const overlays = this.bpmnJS.get('overlays');
        const overlayKey = `${elementId}_${flag.deviation}_icon`;

        if (!this.iconPositions.has(elementId)) {
            this.iconPositions.set(elementId, {});
        }

        const elementPositions = this.iconPositions.get(elementId);

        if (elementPositions[flag.deviation] === undefined) {
            const existingPositionCount = Object.keys(elementPositions).length;
            elementPositions[flag.deviation] = existingPositionCount * 30;
        }

        const position = elementPositions[flag.deviation];

        if (this.visibleOverlays.has(overlayKey)) {
            overlays.remove(this.visibleOverlays.get(overlayKey));
            this.visibleOverlays.delete(overlayKey);
        }

        const iconOverlay = overlays.add(addedShape, {
            position: {
                top: -30,
                left: position
            },
            html: `<div>${html}</div>`
        });

        this.visibleOverlays.set(overlayKey, iconOverlay);
    }

    updateRegularElementIcon(elementId: string, flag: { deviation: string, details: any }, html: string) {
        const overlays = this.bpmnJS.get('overlays');
        const overlayKey = `${elementId}_${flag.deviation}`;

        if (!this.iconPositions.has(elementId)) {
            this.iconPositions.set(elementId, {});
        }

        const elementPositions = this.iconPositions.get(elementId);

        if (elementPositions[flag.deviation] === undefined) {
            const existingPositionCount = Object.keys(elementPositions).length;
            elementPositions[flag.deviation] = existingPositionCount * 30;
        }

        const position = elementPositions[flag.deviation];

        if (this.visibleOverlays.has(overlayKey)) {
            overlays.remove(this.visibleOverlays.get(overlayKey));
            this.visibleOverlays.delete(overlayKey);
        }

        this.visibleOverlays.set(overlayKey, overlays.add(elementId, {
            position: {
                top: -28,
                right: position
            },
            html: html
        }));
    }

    findGatewayBlock(gateway: any): any[] {
        if (!gateway || !gateway.type.includes('Gateway')) {
            return [];
        }

        const endGateway = this.findEndGateway(gateway);
        return this.collectElementsBetweenGateways(gateway, endGateway);
    }

    findEndGateway(startGateway: any): any {
        const visited = new Set<string>();
        const queue: any[] = [];

        startGateway.outgoing?.forEach(conn => {
            if (conn.target && !visited.has(conn.target.id)) {
                queue.push(conn.target);
                visited.add(conn.target.id);
            }
        });

        while (queue.length > 0) {
            const current = queue.shift();

            if (current.type?.includes('Gateway')) {
                return current;
            }

            current.outgoing?.forEach(conn => {
                if (conn.target && !visited.has(conn.target.id)) {
                    queue.push(conn.target);
                    visited.add(conn.target.id);
                }
            });
        }

        return null;
    }

    calculateBoundingBoxDirect(elements: any[]) {
        if (!elements.length) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        let minX = Infinity;
        let minY = Infinity;
        let maxX = -Infinity;
        let maxY = -Infinity;

        for (const element of elements) {
            if (element.x !== undefined && element.y !== undefined &&
                element.width !== undefined && element.height !== undefined) {
                minX = Math.min(minX, element.x);
                minY = Math.min(minY, element.y);
                maxX = Math.max(maxX, element.x + element.width);
                maxY = Math.max(maxY, element.y + element.height);
            }
        }
        const padding = 10;
        const extraTop = 25;

        return {
            x: minX - padding,
            y: minY - padding - extraTop,
            width: maxX - minX + (2 * padding),
            height: maxY - minY + (2 * padding) + extraTop
        };
    }

    createAggregationTooltip(elementId: string, stageData: any): string {
        const elementName = this.elementNamesMap.get(elementId) || elementId;

        // Handle case where no stage data is available
        if (!stageData) {
            return `<div style="
        width: 250px; 
        background-color: #f8f9fa;
        border: 1px solid #dee2e6;
        border-radius: 5px;
        padding: 10px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      ">
        <h3 style="margin: 0 0 10px 0; color: #495057;">${elementName}</h3>
        <div style="color: #6c757d; font-style: italic;">
          No aggregation data available
        </div>
      </div>`;
        }

        return `<div style="
      width: 350px; 
      background-color: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 5px;
      padding: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    ">
      <h3 style="margin: 0 0 10px 0; color: #495057;">${elementName} - Aggregated</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div>
          <strong>Total Instances:</strong> ${stageData.totalInstances || 0}<br>
          <strong>With Deviations:</strong> ${stageData.instancesWithDeviations || 0}<br>
          <strong>Deviation Rate:</strong> ${(stageData.deviationRate || 0).toFixed(1)}%
        </div>
        <div>
          ${this.formatDeviationCounts(stageData.deviationCounts)}
        </div>
      </div>
    </div>`;
    }

    formatDeviationCounts(counts: any): string {
        if (!counts || Object.keys(counts).length === 0) {
            return '<em>No deviations</em>';
        }

        return Object.entries(counts)
            .map(([type, count]) => `<strong>${type}:</strong> ${count}`)
            .join('<br>');
    }

    getStageAggregationData(stageId: string): any {
        if (!this.aggregationSummary?.perspectives || !Array.isArray(this.aggregationSummary.perspectives)) {
            console.warn('No perspectives data available in aggregation summary');
            return null;
        }

        const perspective = this.aggregationSummary.perspectives[0];
        
        if (!perspective?.stageDetails) {
            console.warn('No stage details available in perspective');
            return null;
        }

        if (perspective.stageDetails[stageId]) {
            return perspective.stageDetails[stageId];
        }
  
        return null;
    }

    removeOverlay(id: string) {
        const overlays = this.bpmnJS.get('overlays');
        const modeling = this.bpmnJS.get('modeling');

        if (this.visibleOverlays.has(id)) {
            const overlay = this.visibleOverlays.get(id);

            if (overlay && overlay.type) {
                modeling.removeShape(overlay);

                const gatewayId = id.split('_')[0];
                if (id.includes('_gateway_block')) {
                    this.gatewayBlocks.delete(gatewayId);

                    const iconsToRemove = [];
                    for (const [key, _] of this.visibleOverlays.entries()) {
                        if (key.startsWith(`${gatewayId}_`) && key.endsWith('_icon')) {
                            iconsToRemove.push(key);
                        }
                    }

                    iconsToRemove.forEach(iconKey => {
                        overlays.remove(this.visibleOverlays.get(iconKey));
                        this.visibleOverlays.delete(iconKey);
                    });

                    if (this.iconPositions.has(gatewayId)) {
                        this.iconPositions.delete(gatewayId);
                    }
                }
            }
            else if (overlay) {
                overlays.remove(overlay);
            }

            this.visibleOverlays.delete(id);
        }
    }

    /**
     * Finds a joining gateway that corresponds to a split gateway
     * @param splitGateway The split gateway element
     * @returns The joining gateway or null if not found
     */
    findJoiningGateway(splitGateway: any): any {
        // Track each path from the split gateway
        const paths: { element: any, visited: Set<string> }[] = [];

        // Initialize with outgoing paths
        splitGateway.outgoing.forEach(conn => {
            const visited = new Set<string>();
            visited.add(splitGateway.id);
            visited.add(conn.target.id);

            paths.push({
                element: conn.target,
                visited
            });
        });

        //Map to track where paths intersect
        const intersections = new Map<string, number>();

        //Process each path
        while (paths.some(p => p.element !== null)) {
            //For each active path
            for (let i = 0; i < paths.length; i++) {
                const path = paths[i];
                if (!path.element) continue;

                //Check if this element appears in other paths
                if (path.element.type.includes('Gateway') && path.element.incoming.length > 1) {
                    intersections.set(path.element.id, (intersections.get(path.element.id) || 0) + 1);

                    //If we've found this element in all paths, it's our joining gateway
                    if (intersections.get(path.element.id) === paths.length) {
                        return path.element;
                    }
                }

                //Move to next element in this path
                if (path.element.outgoing && path.element.outgoing.length > 0) {
                    let nextFound = false;

                    for (const conn of path.element.outgoing) {
                        if (conn.target && !path.visited.has(conn.target.id)) {
                            path.element = conn.target;
                            path.visited.add(conn.target.id);
                            nextFound = true;
                            break;
                        }
                    }

                    if (!nextFound) {
                        path.element = null; //End of this path
                    }
                } else {
                    path.element = null; //End of this path
                }
            }
        }

        return null;
    }

    /**
     * Helper method for findLoopEndGateway that uses DFS to find a converging gateway
     * @param element Current element to explore
     * @param startGateway The original diverging gateway
     * @param visited Set of visited element IDs
     * @returns A converging gateway or null
     */
    findConvergingGatewayDFS(element: any, startGateway: any, visited: Set<string>): any {
        if (!element || visited.has(element.id)) {
            return null;
        }

        visited.add(element.id);

        // Check if this is a gateway with multiple incoming connections
        if (element.type.includes('Gateway') && element.incoming && element.incoming.length > 1) {
            return element;
        }

        // Check each outgoing connection
        if (element.outgoing) {
            for (const conn of element.outgoing) {
                // Skip connections directly back to the start gateway
                if (conn.target && conn.target.id === startGateway.id) {
                    continue;
                }

                // Recursively search
                if (conn.target && !visited.has(conn.target.id)) {
                    const result = this.findConvergingGatewayDFS(conn.target, startGateway, visited);
                    if (result) return result;
                }
            }
        }

        return null;
    }

    /**
     * Determines if a gateway is part of a loop structure
     * @param gateway The gateway element to check
     * @returns Boolean indicating if this is a loop gateway
     */
    isLoopGateway(gateway: any): boolean {
        if (!gateway || gateway.type !== 'bpmn:ExclusiveGateway')
            return false
        if (!gateway.outgoing || gateway.outgoing.length !== 1)
            return false

        const forwardBranch = gateway.outgoing[0]?.target;
        if (!forwardBranch || !forwardBranch.outgoing || forwardBranch.outgoing.length !== 1)
            return false

        const secondGateway = forwardBranch.outgoing[0]?.target;
        if (!secondGateway || secondGateway.type !== 'bpmn:ExclusiveGateway' || !secondGateway.outgoing)
            return false;

        for (const conn of secondGateway.outgoing) {
            const backwardBranch = conn.target;
            if (!backwardBranch || !backwardBranch.outgoing || backwardBranch.outgoing.length !== 1)
                continue;

            if (backwardBranch.outgoing[0]?.target?.id === gateway.id)
                return true;
        }

        return false;
    }

    collectElementsBetweenGateways(startGateway: any, endGateway: any): any[] {
        const collected = new Set<any>();
        const visited = new Set<string>();

        collected.add(startGateway);
        collected.add(endGateway);

        const forwardQueue = [...startGateway.outgoing.map(conn => conn.target)];
        visited.add(startGateway.id);

        while (forwardQueue.length > 0) {
            const current = forwardQueue.shift();

            if (!current || visited.has(current.id)) {
                continue;
            }

            visited.add(current.id);
            collected.add(current);

            if (current.id === endGateway.id) {
                continue;
            }

            if (current.outgoing) {
                for (const conn of current.outgoing) {
                    if (conn.target && !visited.has(conn.target.id)) {
                        if (conn.target.id !== startGateway.id) {
                            forwardQueue.push(conn.target);
                        }
                    }
                }
            }
        }

        if (this.isLoopGateway(startGateway)) {
            for (const conn of endGateway.outgoing || []) {
                if (!conn.target || conn.target.id === startGateway.id) {
                    continue;
                }

                const validPaths = this.collectReturnPathsToStart(conn.target, startGateway.id);

                for (const path of validPaths) {
                    for (const node of path) {
                        collected.add(node);
                    }
                }
            }
        }

        return Array.from(collected);
    }

    /**
     * Collect paths that return to the start gateway (for loop structures)
     */
    collectReturnPathsToStart(fromNode: any, targetId: string, visitedPath: Set<string> = new Set(), currentPath: any[] = []): any[][] {
        if (!fromNode || visitedPath.has(fromNode.id)) {
            return [];
        }

        visitedPath.add(fromNode.id);
        currentPath.push(fromNode);

        if (fromNode.id === targetId) {
            return [Array.from(currentPath)];
        }

        if (fromNode.gatewayDirection && fromNode.id !== targetId) {
            return [];
        }

        const resultPaths: any[][] = [];

        for (const conn of fromNode.outgoing || []) {
            if (conn.target) {
                const subPaths = this.collectReturnPathsToStart(
                    conn.target,
                    targetId,
                    new Set(visitedPath),
                    [...currentPath]
                );
                resultPaths.push(...subPaths);
            }
        }

        return resultPaths;
    }

    generateLegendData(): any[] {
        const legendItems = [];
        const colorMap = new Map<string, { color: any, count: number, maxDeviationRate: number }>();

        this.blockProperties.forEach((props, stageId) => {
            if (props.color) {
                const colorKey = props.color.fill || '#ffffff';

                if (!colorMap.has(colorKey)) {
                    colorMap.set(colorKey, {
                        color: props.color,
                        count: 0,
                        maxDeviationRate: 0
                    });
                }

                const colorData = colorMap.get(colorKey)!;
                colorData.count++;

                const stageData = this.getStageAggregationData(stageId);
                if (stageData && stageData.deviationRate) {
                    colorData.maxDeviationRate = Math.max(colorData.maxDeviationRate, stageData.deviationRate);
                }
            }
        });

        const sortedColors = Array.from(colorMap.entries()).sort((a, b) => b[1].maxDeviationRate - a[1].maxDeviationRate);

        sortedColors.forEach(([_, data]) => {
            const label = this.getDeviationRateLabel(data.maxDeviationRate);
            //TODO: description
            legendItems.push({
                color: data.color,
                label: label
            });
        });

        return legendItems;
    }

    private getDeviationRateLabel(deviationRate: number): string {
        if (deviationRate >= 75) return 'Critical (≥75% deviations)';
        if (deviationRate >= 50) return 'High (50-74% deviations)';
        if (deviationRate >= 25) return 'Medium (25-49% deviations)';
        if (deviationRate > 0) return 'Low (1-24% deviations)';
        return 'No deviations (0%)';
    }



    ngOnDestroy(): void {
        if (this.bpmnJS) {
            this.bpmnJS.destroy();
        }
    }
}
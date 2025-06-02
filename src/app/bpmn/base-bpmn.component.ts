import { ElementRef, OnDestroy, Injectable } from '@angular/core';
import * as BpmnModeler from 'bpmn-js/dist/bpmn-modeler.production.min.js';
import { Color } from '../primitives/primitives';

@Injectable()
export abstract class BaseBpmnComponent implements OnDestroy {
    bpmnJS: BpmnModeler = undefined;
    elementNamesMap = new Map<string, string>();
    iconPositions: Map<string, { [deviationType: string]: number }> = new Map();
    gatewayBlocks: Map<string, any> = new Map();
    blockProperties = new Map();
    visibleOverlays = new Map();

    constructor() {
        this.bpmnJS = new BpmnModeler();
    }

    updateModelXml(value: string) {
        if (value) {
            this.blockProperties.clear();
            this.visibleOverlays.clear();
            this.gatewayBlocks.clear();
            this.iconPositions.clear();
            this.onModelClear?.();

            this.bpmnJS.importXML(value);
            this.bpmnJS.on('import.done', ({ error }) => {
                if (!error) {
                    this.bpmnJS.get('canvas').zoom('fit-viewport');
                }
            });
        }
    }

    populateElementNames(modelXml: string): void {
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(modelXml, 'application/xml');
        const elements = xmlDoc.querySelectorAll('[id]');
        elements.forEach(element => {
            const id = element.getAttribute('id');
            const name = element.getAttribute('name') || '';
            if (id) {
                this.elementNamesMap.set(id, name);
            }
        });
    }

    getElementNameById(elementId: string): string {
        return this.elementNamesMap.get(elementId) || 'Element not found';
    }

    setBlockColor(taskId: string, color: Color) {
        const modeling = this.bpmnJS.get('modeling');
        const elementRegistry = this.bpmnJS.get('elementRegistry');
        const element = elementRegistry.get(taskId);

        if (color == undefined) {
            modeling.setColor([element], null);
        } else {
            modeling.setColor([element], { stroke: color.stroke, fill: color.fill });
        }
    }

    protected updateIconPositions(elementId: string, deviationType: string): number {
        if (!this.iconPositions.has(elementId)) {
            this.iconPositions.set(elementId, {});
        }

        const elementPositions = this.iconPositions.get(elementId);
        if (elementPositions[deviationType] === undefined) {
            const existingPositionCount = Object.keys(elementPositions).length;
            elementPositions[deviationType] = existingPositionCount * 30;
        }

        return elementPositions[deviationType];
    }

    protected generateIconHtml(flag: { deviation: string, details: any }): string {
        switch (flag.deviation) {
            case 'INCOMPLETE':
                return `<img width="25" height="25" src="assets/hazard.png" title="Incomplete">`;
            case 'MULTI_EXECUTION':
                const count = flag.details?.count ?? '?';
                return `<img width="20" height="20" src="assets/repeat.png" title="Executions: ${count}">`;
            case 'INCORRECT_EXECUTION':
                return `<img width="25" height="25" src="assets/cross.png" title="Incorrect Execution">`;
            case 'INCORRECT_BRANCH':
                return `<img width="25" height="25" src="assets/cross.png" title="Incorrect Branch">`;
            case 'SKIPPED':
                return `<img width="25" height="25" src="assets/skip.webp" title="Skipped">`;
            case 'OVERLAP':
                return `<img src="assets/arrows.png" title="Overlaps" style="transform: rotate(90deg); width:25px; height:25px;">`;
            default:
                return '';
        }
    }

    updateRegularElementIcon(elementId: string, flag: { deviation: string, details: any }, customHtml?: string) {
        const overlays = this.bpmnJS.get('overlays');
        const overlayKey = `${elementId}_${flag.deviation}`;
        const position = this.updateIconPositions(elementId, flag.deviation);
        const html = customHtml || this.generateIconHtml(flag);

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

    updateGatewayIcon(elementId: string, flag: { deviation: string, details: any }, html: string, addedShape: any) {
        const overlays = this.bpmnJS.get('overlays');
        const overlayKey = `${elementId}_${flag.deviation}_icon`;
        const position = this.updateIconPositions(elementId, flag.deviation);

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

    /**
   * Finds a gateway that specifically loops back to the starting gateway
   * @param startGateway The starting gateway element
   * @returns The loop end gateway or null if not found
   */
    findEndGateway(startGateway: any): any {
        const visited = new Set<string>();
        const queue: any[] = [];

        // Start from all direct targets of outgoing connections
        startGateway.outgoing?.forEach(conn => {
            if (conn.target && !visited.has(conn.target.id)) {
                queue.push(conn.target);
                visited.add(conn.target.id);
            }
        });

        while (queue.length > 0) {
            const current = queue.shift();

            if (current.type?.includes('Gateway')) {
                return current; // Found the closest gateway
            }

            current.outgoing?.forEach(conn => {
                if (conn.target && !visited.has(conn.target.id)) {
                    queue.push(conn.target);
                    visited.add(conn.target.id);
                }
            });
        }

        return null; // No gateway found downstream
    }

    calculateBoundingBoxDirect(elements: any[]) {
        if (!elements.length) {
            return { x: 0, y: 0, width: 0, height: 0 };
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

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

    /**
   * Finds elements that are part of a gateway structure (split/join or loop)
   * @param gateway The gateway element to analyze
   * @returns Array of elements in the gateway block
   */
    findGatewayBlock(gateway: any): any[] {
        if (!gateway || !gateway.type.includes('Gateway')) {
            return [];
        }

        const collected = new Set<any>();
        const gateways = new Map<string, any>();

        collected.add(gateway);
        gateways.set(gateway.id, gateway);

        const endGateway = this.findEndGateway(gateway);
        return this.collectElementsBetweenGateways(gateway, endGateway);
    }

    /**
   * Collects all elements between two gateways
   * @param startGateway The diverging gateway
   * @param endGateway The converging gateway
   * @returns Array of elements between and including the two gateways
   */
    collectElementsBetweenGateways(startGateway: any, endGateway: any): any[] {
        const collected = new Set<any>();
        const visited = new Set<string>();

        // Add the gateways themselves
        collected.add(startGateway);
        collected.add(endGateway);

        // First part: collect all elements from start gateway to end gateway
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
        // This is a common pattern for loop end gateways
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
                    this.cleanupGatewayIcons(gatewayId, overlays);
                }
            } else if (overlay) {
                overlays.remove(overlay);
            }

            this.visibleOverlays.delete(id);
        }
    }

    private cleanupGatewayIcons(gatewayId: string, overlays: any) {
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

    // Hook for subclasses to override
    protected onModelClear?(): void;

    ngOnDestroy(): void {
        if (this.bpmnJS) {
            this.bpmnJS.destroy();
        }
    }
}
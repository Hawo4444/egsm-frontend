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
import { BpmnBlockOverlayReport, Color, ProcessPerspectiveStatistic } from '../primitives/primitives';


@Component({
  selector: 'app-bpmn',
  templateUrl: './bpmn.component.html',
  styleUrls: ['./bpmn.component.scss'],
})

export class BpmnComponent implements AfterContentInit, OnDestroy {
  bpmnJS: BpmnModeler = undefined //The BPMN Modeller instance
  elementNamesMap = new Map<string, string>();

  @ViewChild('ref', { static: true }) private el: ElementRef;

  @Input() show_statistics: boolean;
  @Input() public model_id: string;
  @Input() public model_xml: string;
  @Output() DiagramEventEmitter: Subject<any> = new Subject();

  blockStatistics = new Map() //Containing statistics for block (Block name -> {Statistics})
  blockProperties = new Map() //Block name -> {BpmnBlockOverlayReport}

  visibleOverlays = new Map() //Block name where the overlay attached to AND/OR unique role ID (e.g.: 'statisctic-overlay') -> Library generated Overlay ID (needed to make possible removals)
  flagCounts = new Map();

  constructor() {
    this.bpmnJS = new BpmnModeler();
  }

  ngAfterContentInit(): void {
    this.bpmnJS.attachTo(this.el.nativeElement);
    if (this.model_xml) {
      this.updateModelXml(this.model_xml)
      this.populateElementNames()
    }

    var eventBus = this.bpmnJS.get('eventBus'); //Eventbus to receive diagram events
    var bpmnJsRef = this.bpmnJS

    if (this.show_statistics) {
      var visibleOveraysCopy = this.visibleOverlays
      var context = this
      eventBus.on('element.hover', function (e) {
        var elementId = e.element.id
        if (context.blockStatistics.has(elementId)) {
          var overlay = bpmnJsRef.get('overlays');
          if (visibleOveraysCopy.has('statisctic-overlay')) {
            overlay.remove(visibleOveraysCopy.get('statisctic-overlay'))
            visibleOveraysCopy.delete('statisctic-overlay')
          }
          visibleOveraysCopy.set('statisctic-overlay', overlay.add(elementId, {
            position: {
              top: -25,
              right: 0
            },
            html: `<div style="width: 300px; background-color:#ffcc66;"><h1>${elementId} - Historical</h1>` +
              `<p>Regular: ${context.blockStatistics.get(elementId).values.regular}<br>` +
              `Faulty: ${context.blockStatistics.get(elementId).values.faulty}<br>` +
              `Unopened: ${context.blockStatistics.get(elementId).values.unopened}<br>` +
              `Opened: ${context.blockStatistics.get(elementId).values.opened}<br>` +
              `Skipped: ${context.blockStatistics.get(elementId).values.skipped}<br>` +
              `OnTime: ${context.blockStatistics.get(elementId).values.onTime}<br>` +
              `OutOfOrder: ${context.blockStatistics.get(elementId).values.outOfOrder}<br>` +
              `SkipDeviation Skipped: ${context.blockStatistics.get(elementId).values.skipdeviation_skipped}<br>` +
              `SkipDeviation OoO: ${context.blockStatistics.get(elementId).values.skipdeviation_outoforder}<br>` +
              `Flow Violation: ${context.blockStatistics.get(elementId).values.flow_violation}<br>` +
              `Incomplete Execution: ${context.blockStatistics.get(elementId).values.incomplete_execution}<br>` +
              `Multi Execution Deviation: ${context.blockStatistics.get(elementId).values.multi_execution}</p>` +
              `<h1>Real Time</h1>` +
              `<p>Regular: ${context.blockStatistics.get(elementId).values.real_time_regular}<br>` +
              `Faulty: ${context.blockStatistics.get(elementId).values.real_time_faulty}<br>` +
              `Unopened: ${context.blockStatistics.get(elementId).values.real_time_unopened}<br>` +
              `Opened: ${context.blockStatistics.get(elementId).values.real_time_opened}<br>` +
              `Skipped: ${context.blockStatistics.get(elementId).values.real_time_skipped}<br>` +
              `Ontime: ${context.blockStatistics.get(elementId).values.real_time_ontime}<br>` +
              `OutOfOrder: ${context.blockStatistics.get(elementId).values.real_time_outoforder}</p>` +
              `</div>`
          }));
        }
      })
    }
    this.DiagramEventEmitter.next('INIT_DONE')
  }

  /**
   * Function to update the XML describing the displayed diagram
   * Since this XML contains the foundations of the diagram as a side-effect this function clears all
   * block properties, block overlays and block statistics, because on the new diagram they may have no effect,
   * or they would lead to unexpected behavior
   * @param value Bpmn diagram in XML format
   */
  updateModelXml(value: string) {
    if (value) {
      this.blockStatistics.clear()
      this.blockProperties.clear()
      this.visibleOverlays.clear()
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
   * Apply a list of BpmnBlockOverlayReport-s on the diagram
   * The function iterates through all reports in the 'overlayreport' attribute and applies its content on the diagram
   * BpmnBlockOverlayReport-s can change block color or add icon(s) to blocks
   * @param overlayreport List of BpmnBlockOverlayReport-s
   */
  applyOverlayReport(overlayreport: BpmnBlockOverlayReport[]) {
    var overlay = this.bpmnJS.get('overlays');
    overlayreport.forEach(element => {
      //Check if the element.id exists in this.visibleOverlays
      //If yes then check if the new overlay introduces any changes
      if (this.blockProperties.has(element.block_id)) {
        if (this.blockProperties.get(element.block_id).color != element.color) {
          this.setBlockColor(element.block_id, element.color)
          this.blockProperties.get(element.block_id).color = element.color
        }
        this.blockProperties.get(element.block_id).flags.forEach(flag => {
          if (!element.flags.some(f => f.deviation === flag)) {
            // Remove flag since it's no longer part of the report
            overlay.remove(this.visibleOverlays.get(element.block_id + flag));
            this.visibleOverlays.delete(element.block_id + flag);
            this.blockProperties.get(element.block_id).flags.delete(flag);
          }
        })
        element.flags.forEach(flag => {
          if (!this.visibleOverlays.has(element.block_id + "_" + flag.deviation)) {
            this.addFlagToOverlay(element.block_id, flag);
          }
        });
      } else {
        this.blockProperties.set(element.block_id, { color: element.color, flags: new Set(element.flags.map(f => f.deviation)) });
        this.setBlockColor(element.block_id, element.color);
        element.flags.forEach(flag => {
          this.addFlagToOverlay(element.block_id, flag);
        });
      }
    });
  }

  /**
   * Updates a list of ProcessPerspectiveStatistic instances on the diagram
   * If statistic for a certain block is already exists then the function will overwrite it if any of the provided ProcessPerspectiveStatistic instances 
   * regards that particular block
   * @param perspectiveStatistic 
   */
  updateStatistics(perspectiveStatistic: ProcessPerspectiveStatistic) {
    if (this.show_statistics) {
      this.blockStatistics.clear()
      perspectiveStatistic.statistics.forEach(element => {
        this.blockStatistics.set(element.id, element)
      });
    }
    else {
      console.warn("updateStatistics is not enabled since showStatistics is False")
    }
  }

  /**
   * Updates the color of a block (edge, event, task etc.)
   * @param taskId Id of the block
   * @param color New color as a {stroke; fill} object
   */
  setBlockColor(taskId: string, color: Color) {
    var modeling = this.bpmnJS.get('modeling');
    var elementRegistry = this.bpmnJS.get('elementRegistry');
    var element = elementRegistry.get(taskId)
    if (color == undefined) {
      modeling.setColor([element], null);
    }
    else {
      modeling.setColor([element], { stroke: color.stroke, fill: color.fill });
    }
  }

  getElementNameById(elementId: string): string {
    return this.elementNamesMap.get(elementId) || 'Element not found';
  }

  /**
 * Adds a flag to an element on the diagram
 * If a certain type of flag is already added to a block, the function will not add it again to avoid duplicating flags
 * @param elementId Id of the block the flag should be added to
 * @param flag Type of the flag
 */
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

    // Generate the HTML for the icon based on flag type
    let html = '';
    switch (flag.deviation) {
      case 'INCOMPLETE':
        html = `<img width="25" height="25" src="assets/hazard.png">`;
        break;
      case 'MULTI_EXECUTION':
        const count = flag.details?.count ?? '?';
        html = `<img width="20" height="20" src="assets/repeat.png" title="Executions: ${count}">`;
        break;
      case 'INCORRECT_EXECUTION':
      case 'INCORRECT_BRANCH':
        html = `<img width="25" height="25" src="assets/cross.png">`;
        break;
      case 'SKIPPED':
        html = `<img width="25" height="25" src="assets/skip.webp">`;
        break;
      case 'OVERLAP':
        const over = flag.details?.over?.map(id => this.getElementNameById(id))?.join("\n") ?? '?';
        html = `<img src="assets/arrows.png" title="Overlaps:\n${over}" style="transform: rotate(90deg); width:25px; height:25px;">`;
        break;
    }

    const isGateway = element.type.includes('Gateway');
    if (isGateway) {
      const regionElements = this.findGatewayBlock(element);

      if (regionElements.length > 0) {
        // Remove any existing overlay for this element and flag type
        this.removeOverlay(`${elementId}_${flag.deviation}_block`);

        // Calculate the bounding box of the gateway region
        const bbox = this.calculateBoundingBoxDirect(regionElements);

        // Create a shape for the rectangle
        const shape = elementFactory.createShape({
          type: 'bpmn:Group',
          businessObject: {}
        });

        // Set the shape's position and dimensions
        shape.x = bbox.x;
        shape.y = bbox.y;
        shape.width = bbox.width;
        shape.height = bbox.height;

        // Create a class to identify this element for potential removal later
        const rectId = `gateway-block-${elementId}`;

        // Add the rectangle to the root of the diagram
        const rootElement = canvas.getRootElement();
        const addedShape = modeling.createShape(shape, { x: bbox.x + bbox.width / 2, y: bbox.y + bbox.height / 2 }, rootElement);

        /*modeling.setColor(addedShape, {
          stroke: 'red',
          fill: null
        });*/

        const gfx = elementRegistry.getGraphics(addedShape);
        const rect = gfx.querySelector('rect'); // or 'path' depending on element

        if (rect) {
          rect.removeAttribute('style');
          rect.setAttribute('stroke', 'red');
          rect.setAttribute('stroke-width', '2');
          rect.setAttribute('stroke-dasharray', '4,2'); // dashed line: 4px dash, 2px gap
          rect.setAttribute('fill', 'none');
        }

        // Store a reference to this shape for later removal
        this.visibleOverlays.set(`${elementId}_${flag.deviation}_block`, addedShape);

        // Also add the icon overlay to the gateway
        const iconOverlay = overlays.add(isGateway ? addedShape : elementId, {
          position: {
            top: -30,
            left: this.getNextFlagOffset(elementId)
          },
          html: `<div>${html}</div>`
        });

        this.visibleOverlays.set(`${elementId}_${flag.deviation}_icon`, iconOverlay);
        return;
      }
    }

    // Fallback: normal flag added to the element
    let flagNumber = 0;
    for (const [key] of this.visibleOverlays.entries()) {
      if (key.includes(elementId)) flagNumber++;
    }

    // Add the overlay
    this.visibleOverlays.set(`${elementId}_${flag.deviation}`, overlays.add(elementId, {
      position: {
        top: -28,
        right: 30 * flagNumber
      },
      html: html
    }));
  }

  /**
   * Removes an overlay from the diagram
   * @param id Id of the overlay to remove
   */
  removeOverlay(id: string) {
    const overlays = this.bpmnJS.get('overlays');
    const modeling = this.bpmnJS.get('modeling');

    if (this.visibleOverlays.has(id)) {
      const overlay = this.visibleOverlays.get(id);

      // Check if this is a shape that needs to be removed
      if (overlay && overlay.type) {
        modeling.removeShape(overlay);
      }
      // Otherwise it's a regular overlay
      else if (overlay) {
        overlays.remove(overlay);
      }

      this.visibleOverlays.delete(id);
    }
  }

  /**
   * Calculate the bounding box directly from model elements
   * @param elements Array of BPMN elements
   * @returns Bounding box in model coordinates
   */
  calculateBoundingBoxDirect(elements: any[]) {
    if (!elements.length) {
      return { x: 0, y: 0, width: 0, height: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const element of elements) {
      // Use element's direct coordinates
      if (element.x !== undefined && element.y !== undefined &&
        element.width !== undefined && element.height !== undefined) {
        minX = Math.min(minX, element.x);
        minY = Math.min(minY, element.y);
        maxX = Math.max(maxX, element.x + element.width);
        maxY = Math.max(maxY, element.y + element.height);
      }
    }

    // Add padding around the bounding box
    const padding = 10;

    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + (2 * padding),
      height: maxY - minY + (2 * padding)
    };
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

    // Map to track where paths intersect
    const intersections = new Map<string, number>();

    // Process each path
    while (paths.some(p => p.element !== null)) {
      // For each active path
      for (let i = 0; i < paths.length; i++) {
        const path = paths[i];
        if (!path.element) continue;

        // Check if this element appears in other paths
        if (path.element.type.includes('Gateway') && path.element.incoming.length > 1) {
          intersections.set(path.element.id, (intersections.get(path.element.id) || 0) + 1);

          // If we've found this element in all paths, it's our joining gateway
          if (intersections.get(path.element.id) === paths.length) {
            return path.element;
          }
        }

        // Move to next element in this path
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
            path.element = null; // End of this path
          }
        } else {
          path.element = null; // End of this path
        }
      }
    }

    return null;
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
   * Determines if a gateway is part of a loop structure
   * @param gateway The gateway element to check
   * @returns Boolean indicating if this is a loop gateway
   */
  isLoopGateway(gateway: any): boolean {
    return gateway?.type === 'bpmn:ExclusiveGateway' && gateway?.incoming?.length === 2 && gateway?.outgoing?.length === 1
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

  private getNextFlagOffset(elementId: string): number {
    const count = this.flagCounts.get(elementId) || 0;
    this.flagCounts.set(elementId, count + 1);
    return count * 30; // 30px horizontal spacing
  }

  /**
   * Updates the style of a shape element
   * @param shape The shape to update
   * @param styleProperties Object with CSS properties to apply
   */
  /*updateShapeStyle(shape: any, styleProperties: Record<string, string>) {
    if (!shape || !shape.id) return;

    // Get the element from the registry to ensure we're working with the live element
    const elementRegistry = this.bpmnJS.get('elementRegistry');
    const canvas = this.bpmnJS.get('canvas');

    const element = elementRegistry.get(shape.id);
    if (!element) return;

    // Get the graphical element
    const gfx = canvas.getGraphics(element);
    if (!gfx) return;

    // Find the path or rect element that represents the shape outline
    const outline = gfx.querySelector('path') || gfx.querySelector('rect');
    if (!outline) return;

    // Apply the style properties
    Object.entries(styleProperties).forEach(([prop, value]) => {
      outline.style[prop] = value;
    });
  }*/

  ngOnDestroy(): void {
    this.bpmnJS.destroy();
  }
}
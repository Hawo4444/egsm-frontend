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

import { Subject } from 'rxjs';
import { BpmnBlockOverlayReport, Color } from '../primitives/primitives';
import { BaseBpmnComponent } from './base-bpmn.component';

@Component({
    selector: 'app-aggregated-bpmn',
    templateUrl: './bpmn.component.html',
    styleUrls: ['./bpmn.component.scss'],
})
export class AggregatedBpmnComponent extends BaseBpmnComponent implements AfterContentInit {
    // Component-specific properties
    private appliedColors = new Map<string, { color: Color, deviationRate: number }>();

    @ViewChild('ref', { static: true }) private el: ElementRef;
    @Input() public model_id: string;
    @Input() public model_xml: string;
    @Input() public aggregationSummary: any;
    @Output() DiagramEventEmitter: Subject<any> = new Subject();
    @Output() legendDataChanged: Subject<any[]> = new Subject();

    ngAfterContentInit(): void {
        this.bpmnJS.attachTo(this.el.nativeElement);
        if (this.model_xml) {
            this.updateModelXml(this.model_xml);
            this.populateElementNames(this.model_xml);
        }

        this.setupAggregationEventHandlers();
        this.DiagramEventEmitter.next('INIT_DONE');
    }

    protected override onModelClear(): void {
        this.appliedColors.clear();
    }

    private setupAggregationEventHandlers() {
        const eventBus = this.bpmnJS.get('eventBus');
        const bpmnJsRef = this.bpmnJS;
        const context = this;

        eventBus.on('element.hover', function (e) {
            const elementId = e.element.id;

            const isGatewayBlock = Array.from(context.gatewayBlocks.values()).some(block => block.id === elementId);

            let targetElementId = elementId;
            if (isGatewayBlock) {
                for (const [gatewayId, block] of context.gatewayBlocks.entries()) {
                    if (block.id === elementId) {
                        targetElementId = gatewayId;
                        break;
                    }
                }
            }

            const isGatewayWithBlock = e.element.type?.includes('Gateway') && context.gatewayBlocks.has(elementId);
            const isSecondGatewayInBlock = e.element.type?.includes('Gateway') &&
                Array.from(context.gatewayBlocks.keys()).some(gatewayId => {
                    const gatewayElement = context.bpmnJS.get('elementRegistry').get(gatewayId);
                    const endGateway = context.findEndGateway(gatewayElement);
                    return endGateway && endGateway.id === elementId;
                });

            if (isGatewayWithBlock || isSecondGatewayInBlock) {
                return;
            }

            if (context.blockProperties.has(targetElementId) ||
                e.element.type?.includes('Task') ||
                e.element.type?.includes('Event') ||
                (e.element.type?.includes('Gateway') && !isGatewayWithBlock && !isSecondGatewayInBlock) ||
                isGatewayBlock) {

                const stageData = context.getStageAggregationData(targetElementId);
                const overlay = bpmnJsRef.get('overlays');

                if (context.visibleOverlays.has('aggregation-overlay')) {
                    overlay.remove(context.visibleOverlays.get('aggregation-overlay'));
                    context.visibleOverlays.delete('aggregation-overlay');
                }

                context.visibleOverlays.set('aggregation-overlay', overlay.add(elementId, {
                    position: {
                        top: -25,
                        right: 0
                    },
                    html: `<div style="z-index: 1000; position: relative;">${context.createAggregationTooltip(targetElementId, stageData)}</div>`
                }));
            }
        });

        eventBus.on('element.out', function (e) {
            if (context.visibleOverlays.has('aggregation-overlay')) {
                const overlay = bpmnJsRef.get('overlays');
                overlay.remove(context.visibleOverlays.get('aggregation-overlay'));
                context.visibleOverlays.delete('aggregation-overlay');
            }
        });
    }

    // Override base method for aggregated coloring
    override setBlockColor(taskId: string, color: Color) {
        const modeling = this.bpmnJS.get('modeling');
        const elementRegistry = this.bpmnJS.get('elementRegistry');
        const element = elementRegistry.get(taskId);

        if (color == undefined) {
            modeling.setColor([element], { fill: '#ffffff' });
        } else {
            modeling.setColor([element], { fill: color.fill });
        }
    }

    // Override base method for aggregated icon generation
    protected override generateIconHtml(flag: { deviation: string, details: any }): string {
        switch (flag.deviation) {
            case 'INCOMPLETE':
                return `<img width="25" height="25" src="assets/hazard.png" title="Incomplete Executions: ${flag.details?.count || '?'}">`;
            case 'MULTI_EXECUTION':
                const count = flag.details?.count ?? '?';
                return `<img width="20" height="20" src="assets/repeat.png" title="Multi Executions: ${count}">`;
            case 'INCORRECT_EXECUTION':
                return `<img width="25" height="25" src="assets/cross.png" title="Incorrect Executions: ${flag.details?.count || '?'}">`;
            case 'INCORRECT_BRANCH':
                return `<img width="25" height="25" src="assets/cross.png" title="Incorrect Branch: ${flag.details?.count || '?'}">`;
            case 'SKIPPED':
                return `<img width="25" height="25" src="assets/skip.webp" title="Skipped: ${flag.details?.count || '?'}">`;
            case 'OVERLAP':
                return `<img src="assets/arrows.png" title="Overlaps: ${flag.details?.count || '?'}" style="transform: rotate(90deg); width:25px; height:25px;">`;
            default:
                return '';
        }
    }

    applyAggregatedOverlayReport(overlayreport: BpmnBlockOverlayReport[]) {
        overlayreport.forEach(element => {
            if (element.color) {
                const stageData = this.getStageAggregationData(element.block_id);
                this.appliedColors.set(element.block_id, {
                    color: element.color,
                    deviationRate: stageData?.deviationRate || 0
                });
            }

            if (this.blockProperties.has(element.block_id)) {
                const currentProps = this.blockProperties.get(element.block_id);
                const elementRegistry = this.bpmnJS.get('elementRegistry');
                const bpmnElement = elementRegistry.get(element.block_id);
                const isGateway = bpmnElement?.type.includes('Gateway');

                if (currentProps.color != element.color && !isGateway) {
                    this.setBlockColor(element.block_id, element.color);
                    currentProps.color = element.color;
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

        const html = this.generateIconHtml(flag);

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
                        
                        let backgroundColor = '#f0f0f0';
                        if (this.appliedColors.has(elementId)) {
                            const appliedColor = this.appliedColors.get(elementId)!.color;
                            backgroundColor = appliedColor.fill || '#f0f0f0';
                        }
                        
                        rect.setAttribute('stroke', 'red');
                        rect.setAttribute('stroke-width', '2');
                        rect.setAttribute('stroke-dasharray', '4,2');
                        rect.setAttribute('fill', backgroundColor);
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

    createAggregationTooltip(elementId: string, stageData: any): string {
        const elementName = this.elementNamesMap.get(elementId) || elementId;

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

    generateLegendData(): any[] {
        const legendItems = [];
        const colorMap = new Map<string, { color: any, count: number, maxDeviationRate: number }>();

        this.appliedColors.forEach((colorData, stageId) => {
            const colorKey = colorData.color.fill || '#ffffff';

            if (!colorMap.has(colorKey)) {
                colorMap.set(colorKey, {
                    color: colorData.color,
                    count: 0,
                    maxDeviationRate: 0
                });
            }

            const mapData = colorMap.get(colorKey)!;
            mapData.count++;
            mapData.maxDeviationRate = Math.max(mapData.maxDeviationRate, colorData.deviationRate);
        });

        const sortedColors = Array.from(colorMap.entries()).sort((a, b) => b[1].maxDeviationRate - a[1].maxDeviationRate);

        sortedColors.forEach(([_, data]) => {
            const label = this.getDeviationRateLabel(data.maxDeviationRate);
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
}
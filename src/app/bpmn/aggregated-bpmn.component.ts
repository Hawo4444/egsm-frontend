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
    templateUrl: './aggregated-bpmn.component.html',
    styleUrls: ['./aggregated-bpmn.component.scss'],
})
export class AggregatedBpmnComponent extends BaseBpmnComponent implements AfterContentInit {
    private appliedColors = new Map<string, { color: Color, deviationRate: number }>();

    @ViewChild('ref', { static: true }) private el: ElementRef;
    @ViewChild('aggregationTooltipTemplate', { static: true }) private aggregationTooltipTemplate: ElementRef;
    @ViewChild('noDataTooltipTemplate', { static: true }) private noDataTooltipTemplate: ElementRef;
    
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

                const tooltipHtml = context.createAggregationTooltip(targetElementId, stageData);
                
                context.visibleOverlays.set('aggregation-overlay', overlay.add(elementId, {
                    position: {
                        top: -25,
                        right: 0
                    },
                    html: `<div style="z-index: 1000; position: relative;">${tooltipHtml}</div>`
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
            const template = this.noDataTooltipTemplate.nativeElement.cloneNode(true) as HTMLElement;
            const titleElement = template.querySelector('.tooltip-title');
            if (titleElement) {
                titleElement.textContent = elementName;
            }
            return template.outerHTML;
        }

        const template = this.aggregationTooltipTemplate.nativeElement.cloneNode(true) as HTMLElement;
        
        const titleElement = template.querySelector('.tooltip-title');
        if (titleElement) {
            titleElement.textContent = `${elementName} - Aggregated`;
        }

        const totalInstancesElement = template.querySelector('.total-instances');
        if (totalInstancesElement) {
            totalInstancesElement.textContent = (stageData.totalInstances || 0).toString();
        }

        const withDeviationsElement = template.querySelector('.with-deviations');
        if (withDeviationsElement) {
            withDeviationsElement.textContent = (stageData.instancesWithDeviations || 0).toString();
        }

        const deviationRateElement = template.querySelector('.deviation-rate');
        if (deviationRateElement) {
            deviationRateElement.textContent = `${(stageData.deviationRate || 0).toFixed(1)}%`;
        }

        const deviationCountsElement = template.querySelector('.deviation-counts');
        if (deviationCountsElement) {
            deviationCountsElement.innerHTML = this.formatDeviationCountsHtml(stageData.deviationCounts);
        }

        return template.outerHTML;
    }

    formatDeviationCountsHtml(counts: any): string {
        if (!counts || Object.keys(counts).length === 0) {
            return '<div class="no-deviations">No deviations</div>';
        }

        return Object.entries(counts)
            .map(([type, count]) => 
                `<div class="deviation-item"><strong>${this.formatDeviationType(type)}:</strong> ${count}</div>`
            )
            .join('');
    }

    private formatDeviationType(deviationType: string): string {
        switch (deviationType) {
            case 'SKIPPED':
                return 'Skipped';
            case 'OVERLAP':
                return 'Overlaps';
            case 'INCORRECT_EXECUTION_SEQUENCE':
                return 'Incorrect Execution';
            case 'INCOMPLETE':
                return 'Incomplete';
            case 'MULTI_EXECUTION':
                return 'Multi Execution';
            case 'INCORRECT_BRANCH':
                return 'Incorrect Branch';
            default:
                return deviationType
                    .toLowerCase()
                    .split('_')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
        }
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
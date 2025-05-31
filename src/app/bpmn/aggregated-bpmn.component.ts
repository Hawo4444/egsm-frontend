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

    @ViewChild('ref', { static: true }) private el: ElementRef;

    @Input() public model_id: string;
    @Input() public model_xml: string;
    @Input() public aggregationSummary: any; // New: for aggregation-specific data
    @Output() DiagramEventEmitter: Subject<any> = new Subject();

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

        // Hover to show aggregation statistics
        eventBus.on('element.hover', function (e) {
            var elementId = e.element.id
            var stageData = context.getStageAggregationData(elementId);

            if (stageData) {
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
     * Apply aggregated overlay reports - similar to original but for aggregation data
     */
    applyAggregatedOverlayReport(overlayreport: BpmnBlockOverlayReport[]) {
        overlayreport.forEach(element => {
            if (this.blockProperties.has(element.block_id)) {
                if (this.blockProperties.get(element.block_id).color != element.color) {
                    this.setBlockColor(element.block_id, element.color)
                    this.blockProperties.get(element.block_id).color = element.color
                }
                // Update aggregation flags
                this.updateAggregationFlags(element.block_id, element.flags);
            } else {
                this.blockProperties.set(element.block_id, {
                    color: element.color,
                    flags: element.flags
                });
                this.setBlockColor(element.block_id, element.color);
                this.addAggregationFlags(element.block_id, element.flags);
            }
        });
    }

    setBlockColor(blockId: string, color: Color) {
        var modeling = this.bpmnJS.get('modeling');
        var elementRegistry = this.bpmnJS.get('elementRegistry');
        var element = elementRegistry.get(blockId);

        if (element) {
            const colorMap = {
                'GREEN': '#90EE90',
                'YELLOW': '#FFFF99',
                'ORANGE': '#FFA500',
                'RED': '#FF6B6B',
                'DARK_RED': '#CC0000'
            };

            const colorKey = String(color);
            modeling.setColor(element, {
                stroke: colorMap[colorKey] || '#000000',
                fill: colorMap[colorKey] || '#FFFFFF'
            });
        }
    }

    addAggregationFlags(blockId: string, flags: any[]) {
        var overlay = this.bpmnJS.get('overlays');

        flags.forEach((flag, index) => {
            const overlayId = overlay.add(blockId, {
                position: {
                    top: -10 - (index * 15),
                    left: 5 + (index * 20)
                },
                html: this.createAggregationFlag(flag)
            });

            this.visibleOverlays.set(`${blockId}_flag_${index}`, overlayId);
        });
    }

    updateAggregationFlags(blockId: string, flags: any[]) {
        // Remove existing flags
        Array.from(this.visibleOverlays.keys())
            .filter(key => key.startsWith(`${blockId}_flag_`))
            .forEach(key => {
                var overlay = this.bpmnJS.get('overlays');
                overlay.remove(this.visibleOverlays.get(key));
                this.visibleOverlays.delete(key);
            });

        // Add new flags
        this.addAggregationFlags(blockId, flags);
    }

    createAggregationFlag(flag: any): string {
        const severityColors = {
            'CRITICAL': '#CC0000',
            'HIGH': '#FF6B6B',
            'MEDIUM': '#FFA500',
            'LOW': '#FFFF99'
        };

        const backgroundColor = severityColors[flag.severity] || '#90EE90';

        return `<div style="
      background-color: ${backgroundColor};
      color: white;
      padding: 2px 4px;
      border-radius: 3px;
      font-size: 10px;
      font-weight: bold;
      border: 1px solid #333;
      min-width: 20px;
      text-align: center;
    ">${flag.value}</div>`;
    }

    createAggregationTooltip(elementId: string, stageData: any): string {
        const elementName = this.elementNamesMap.get(elementId) || elementId;

        return `<div style="
      width: 350px; 
      background-color: #f8f9fa;
      border: 1px solid #dee2e6;
      border-radius: 5px;
      padding: 10px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    ">
      <h3 style="margin: 0 0 10px 0; color: #495057;">${elementName}</h3>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div>
          <strong>Total Instances:</strong> ${stageData.totalInstances}<br>
          <strong>With Deviations:</strong> ${stageData.instancesWithDeviations}<br>
          <strong>Deviation Rate:</strong> ${stageData.deviationRate?.toFixed(1)}%
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
        // Extract stage data from aggregationSummary
        // This depends on the exact structure you send from backend
        return this.aggregationSummary?.stageDetails?.[stageId];
    }

    removeOverlay(key: string) {
        if (this.visibleOverlays.has(key)) {
            var overlay = this.bpmnJS.get('overlays');
            overlay.remove(this.visibleOverlays.get(key));
            this.visibleOverlays.delete(key);
        }
    }

    ngOnDestroy(): void {
        if (this.bpmnJS) {
            this.bpmnJS.destroy();
        }
    }
}